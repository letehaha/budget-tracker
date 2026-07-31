import { AI_FEATURE, AI_PROVIDER, CATEGORIZATION_SOURCE, SSE_EVENT_TYPES } from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { trackAiCategorization } from '@js/utils/posthog';
import Accounts from '@models/accounts.model';
import { getCategories } from '@models/categories.model';
import Payees from '@models/payees.model';
import Transactions from '@models/transactions.model';
import {
  AIClientResult,
  buildModelNotServedMessage,
  createAIClient,
  isAuthError,
  isModelNotFoundError,
  isTemporaryError,
  unwrapRetryError,
} from '@services/ai';
import { sseManager } from '@services/common/sse';
import { markApiKeyInvalid, markApiKeyValid } from '@services/user-settings/ai-api-key';
import { getCustomInstructions } from '@services/user-settings/ai-custom-instructions';
import { generateText } from 'ai';

import { buildSystemPrompt, buildUserMessage } from './prompt-builder';
import { CategorizationBatchResult, CategorizationResult, TransactionForCategorization } from './types';
import { buildCategoryList } from './utils/build-category-list';
import { parseCategorizationResponse } from './utils/parse-response';

const INVALID_KEY_ERROR_MESSAGE =
  'API key is not working. Please verify the key is correct, has sufficient credits, and has the required permissions.';

/** A local endpoint often has no key at all, so credits and permissions are the wrong advice. */
const CUSTOM_ENDPOINT_REJECTED_ERROR_MESSAGE =
  'Your custom AI endpoint rejected the request. Please verify its URL, model name, and API key in AI settings.';

/** Shown when the outbound guard refuses the endpoint's address mid-run */
const CUSTOM_ENDPOINT_ADDRESS_BLOCKED_ERROR_MESSAGE =
  'Your custom AI endpoint address was rejected. Please point it at a publicly reachable address in AI settings.';

/** Credentials advice only fits a catalog provider; a custom endpoint gets its own wording. */
function authErrorMessage({ provider }: { provider: AI_PROVIDER }): string {
  return provider === AI_PROVIDER.custom ? CUSTOM_ENDPOINT_REJECTED_ERROR_MESSAGE : INVALID_KEY_ERROR_MESSAGE;
}

// Batch size of 500 provides ~17.5k tokens per batch (average case)
// Well within safe limits for AI models while providing good progress feedback
const BATCH_SIZE = 500;

interface CategorizeBatchResult extends CategorizationBatchResult {
  isAuthError?: boolean;
  isTemporaryError?: boolean;
  /** True if the endpoint answered but does not serve the configured model */
  isModelNotFoundError?: boolean;
  isBlockedAddressError?: boolean;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Categorize a batch of transactions using AI
 */
async function categorizeBatch({
  aiClient,
  transactions,
  categories,
  customInstructions,
}: {
  aiClient: AIClientResult;
  transactions: TransactionForCategorization[];
  categories: Awaited<ReturnType<typeof getCategories>>;
  customInstructions?: string;
}): Promise<CategorizeBatchResult> {
  const categoryList = buildCategoryList(categories);

  const systemPrompt = buildSystemPrompt({ customInstructions });
  const userMessage = buildUserMessage({
    transactions,
    categories: categoryList,
  });

  try {
    const { text, usage } = await generateText({
      model: aiClient.model,
      system: systemPrompt,
      prompt: userMessage,
    });

    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;
    const tokensPerTransaction = transactions.length > 0 ? Math.round(totalTokens / transactions.length) : 0;

    logger.info('[AI Categorization] Batch completed', {
      modelId: aiClient.modelId,
      transactionCount: transactions.length,
      inputTokens,
      outputTokens,
      totalTokens,
      tokensPerTransaction,
    });

    const validCategoryIds = new Set(categories.map((c) => c.id));
    const validTransactionIds = new Set(transactions.map((t) => t.id));

    const results = parseCategorizationResponse({
      response: text,
      validCategoryIds,
      validTransactionIds,
    });

    const successfulIds = new Set(results.map((r) => r.transactionId));
    const failed = transactions.filter((t) => !successfulIds.has(t.id)).map((t) => t.id);

    return {
      successful: results,
      failed,
      tokenUsage: {
        inputTokens,
        outputTokens,
      },
    };
  } catch (error) {
    const cause = unwrapRetryError({ error });
    const causeMessage = cause instanceof Error ? cause.message : String(cause);

    // A blocked address is the user's endpoint config, not a provider failure.
    const isBlockedAddress = cause instanceof ValidationError;
    // Checked before the other two, which would swallow it: `isTemporaryError` accepts
    // anything the SDK flagged retryable, `isAuthError` matches substrings in the message.
    const isModelNotFound = !isBlockedAddress && isModelNotFoundError({ error: cause });
    const isTemp = !isBlockedAddress && !isModelNotFound && isTemporaryError(cause);
    const isAuth = !isBlockedAddress && !isModelNotFound && isAuthError(cause);

    if (isBlockedAddress) {
      logger.info(`AI categorization batch failed (custom endpoint address blocked): ${causeMessage}`);
    } else if (isModelNotFound) {
      // The user picked a model the endpoint does not have: their config, not our bug
      logger.info(`AI categorization batch failed (model not served by endpoint): ${causeMessage}`);
    } else if (isTemp || isAuth) {
      // The parent handles both, so info level keeps them out of Sentry.
      logger.info(`AI categorization batch failed (handled: ${isTemp ? 'temporary' : 'auth'}): ${causeMessage}`);
    } else {
      logger.error({ message: 'AI categorization batch failed', error: cause as Error });
    }

    return {
      successful: [],
      failed: transactions.map((t) => t.id),
      errors: [isBlockedAddress ? CUSTOM_ENDPOINT_ADDRESS_BLOCKED_ERROR_MESSAGE : causeMessage],
      isAuthError: isAuth,
      isTemporaryError: isTemp,
      isModelNotFoundError: isModelNotFound,
      isBlockedAddressError: isBlockedAddress,
    };
  }
}

/** Apply categorization results, grouped by categoryId for bulk updates */
async function applyCategorizationResults({ results }: { results: CategorizationResult[] }): Promise<void> {
  if (results.length === 0) return;

  const now = new Date().toISOString();

  const groupedByCategory = new Map<string, string[]>();
  for (const result of results) {
    if (!groupedByCategory.has(result.categoryId)) {
      groupedByCategory.set(result.categoryId, []);
    }
    groupedByCategory.get(result.categoryId)!.push(result.transactionId);
  }

  // Update by id only. `getUncategorizedTransactions` already gated every id on the
  // requesting user's account ownership via its `Accounts` JOIN. Adding a `userId`
  // filter here would drop shared-account rows a recipient authored on the owner's account.
  await Promise.all(
    Array.from(groupedByCategory.entries()).map(([categoryId, transactionIds]) =>
      Transactions.update(
        {
          categoryId,
          categorizationMeta: {
            source: CATEGORIZATION_SOURCE.ai,
            categorizedAt: now,
          },
        },
        {
          where: { id: transactionIds },
          // A category change doesn't affect balances, so skip the recalculation hooks
          individualHooks: false,
        },
      ),
    ),
  );
}

/**
 * Get uncategorized transactions for a user.
 *
 * Scoped by `Account.userId` (account ownership) via the Accounts INNER JOIN, not
 * `Transactions.userId` (row creator): on a shared account the creator can be a
 * recipient while the account still belongs to the requesting user.
 */
async function getUncategorizedTransactions({
  userId,
  transactionIds,
}: {
  userId: number;
  transactionIds: string[];
}): Promise<TransactionForCategorization[]> {
  const transactions = await Transactions.findAll({
    where: {
      id: transactionIds,
      // Only get transactions that haven't been AI-categorized before
      categorizationMeta: null,
    },
    include: [
      {
        model: Accounts,
        where: { userId },
        required: true,
        attributes: ['name'],
      },
      {
        model: Payees,
        attributes: ['name'],
        required: false,
      },
    ],
    attributes: ['id', 'amount', 'currencyCode', 'time', 'note', 'accountId', 'payeeId'],
  });

  return transactions.map((tx) => ({
    id: tx.id,
    amount: tx.amount,
    currencyCode: tx.currencyCode,
    accountName: (tx as unknown as { account?: { name: string } }).account?.name || 'Unknown',
    datetime: tx.time.toISOString(),
    note: tx.note,
    payeeName: (tx as unknown as { payee?: { name: string } }).payee?.name ?? null,
  }));
}

/**
 * Categorize transactions using AI. Processes in batches of BATCH_SIZE.
 *
 * Any error that would repeat on every batch (temporary, blocked address, model not
 * served, unrecoverable auth) stops the run and returns partial results. Auth errors
 * on a catalog provider retry once on the server key first.
 */
export async function categorizeTransactions({
  userId,
  transactionIds,
  totalTransactionCount,
}: {
  userId: number;
  transactionIds: string[];
  /** For progress tracking. Defaults to transactionIds.length */
  totalTransactionCount?: number;
}): Promise<CategorizationBatchResult> {
  const totalCount = totalTransactionCount ?? transactionIds.length;
  let aiClient = await createAIClient({
    userId,
    feature: AI_FEATURE.categorization,
  });

  if (!aiClient) {
    logger.warn('No AI provider available for categorization', { userId });
    return {
      successful: [],
      failed: transactionIds,
      errors: ['No AI provider configured. Please add an API key or contact support.'],
    };
  }

  logger.info('Using AI provider for categorization', {
    userId,
    provider: aiClient.provider,
    modelId: aiClient.modelId,
    usingUserKey: aiClient.usingUserKey,
  });

  const categories = await getCategories({ userId });
  if (categories.length === 0) {
    logger.info(`User ${userId} has no categories, skipping categorization`);
    return {
      successful: [],
      failed: transactionIds,
      errors: ['No categories configured'],
    };
  }

  const transactions = await getUncategorizedTransactions({ userId, transactionIds });
  if (transactions.length === 0) {
    logger.info(`No uncategorized transactions to process for user ${userId}`);
    return {
      successful: [],
      failed: [],
    };
  }

  let customInstructions: string | undefined;
  if (aiClient.usingUserKey) {
    try {
      customInstructions = await getCustomInstructions({ userId });
    } catch (error) {
      logger.error({ message: 'Failed to fetch custom instructions, proceeding without them', error: error as Error });
    }
  }

  logger.info(`Starting AI categorization for ${transactions.length} transactions for user ${userId}`);

  const allResults: CategorizationBatchResult = {
    successful: [],
    failed: [],
    errors: [],
  };

  const totalTokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    batchCount: 0,
  };

  // Guards against an infinite fallback loop
  let hasTriedFallback = false;

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(transactions.length / BATCH_SIZE)}`);

    const batchResult = await categorizeBatch({
      aiClient,
      transactions: batch,
      categories,
      customInstructions,
    });

    // The guard's verdict holds for the whole run, so every remaining batch would be
    // refused the same way.
    if (batchResult.isBlockedAddressError) {
      logger.info('Stopping AI categorization: custom endpoint address blocked', {
        userId,
        provider: aiClient.provider,
        modelId: aiClient.modelId,
      });

      const remainingTransactions = transactions.slice(i);
      allResults.failed.push(...remainingTransactions.map((t) => t.id));
      allResults.errors!.push(CUSTOM_ENDPOINT_ADDRESS_BLOCKED_ERROR_MESSAGE);
      break;
    }

    // Every remaining batch would repeat the same doomed request. The endpoint itself
    // works, so its stored status stays untouched and the server key is not used: it
    // would quietly run a different model.
    if (batchResult.isModelNotFoundError) {
      const errorMessage = buildModelNotServedMessage({ modelId: aiClient.modelId });

      logger.info(`Stopping AI categorization: ${errorMessage}`, {
        userId,
        provider: aiClient.provider,
        modelId: aiClient.modelId,
        usingUserKey: aiClient.usingUserKey,
      });

      const remainingTransactions = transactions.slice(i);
      allResults.failed.push(...remainingTransactions.map((t) => t.id));
      allResults.errors!.push(errorMessage);
      break;
    }

    if (batchResult.isTemporaryError) {
      logger.info('Temporary AI error, returning early without marking key invalid', {
        userId,
        provider: aiClient.provider,
        usingUserKey: aiClient.usingUserKey,
      });
      const remainingTransactions = transactions.slice(i);
      allResults.failed.push(...remainingTransactions.map((t) => t.id));
      allResults.errors!.push('AI provider temporarily unavailable. Please try again later.');
      break;
    }

    if (batchResult.isAuthError && aiClient.usingUserKey && !hasTriedFallback) {
      const provider = aiClient.provider;
      const errorMessage = authErrorMessage({ provider });
      // The server key points at a cloud provider. A user who configured their own
      // endpoint chose where their data may go, so falling back would send payees,
      // amounts and notes to a provider they never picked.
      const isUserOwnedEndpoint = provider === AI_PROVIDER.custom;

      logger.info('User AI credentials rejected, marking invalid', {
        userId,
        provider,
        willTryServerFallback: !isUserOwnedEndpoint,
      });

      await markApiKeyInvalid({
        userId,
        provider,
        customEndpointId: aiClient.customEndpointId,
        errorMessage,
      });

      if (isUserOwnedEndpoint) {
        const remainingTransactions = transactions.slice(i);
        allResults.failed.push(...remainingTransactions.map((t) => t.id));
        allResults.errors!.push(errorMessage);
        break;
      }

      // Re-resolve: the key is now flagged invalid, so this picks up the server key
      const fallbackClient = await createAIClient({
        userId,
        feature: AI_FEATURE.categorization,
      });

      if (fallbackClient && !fallbackClient.usingUserKey) {
        logger.info('Falling back to server API key', {
          userId,
          provider: fallbackClient.provider,
        });

        aiClient = fallbackClient;
        customInstructions = undefined;
        hasTriedFallback = true;

        // Retry this batch with the fallback client
        i -= BATCH_SIZE;
        continue;
      }

      allResults.failed.push(...batch.map((t) => t.id));
      allResults.errors!.push(errorMessage);
      continue;
    }

    if (batchResult.successful.length > 0) {
      await applyCategorizationResults({ results: batchResult.successful });

      // Success on the user's own key refreshes lastValidatedAt
      if (aiClient.usingUserKey) {
        await markApiKeyValid({
          userId,
          provider: aiClient.provider,
          customEndpointId: aiClient.customEndpointId,
        });
      }
    }

    allResults.successful.push(...batchResult.successful);
    allResults.failed.push(...batchResult.failed);
    if (batchResult.errors) {
      allResults.errors!.push(...batchResult.errors);
    }

    if (batchResult.tokenUsage) {
      totalTokenUsage.inputTokens += batchResult.tokenUsage.inputTokens;
      totalTokenUsage.outputTokens += batchResult.tokenUsage.outputTokens;
      totalTokenUsage.batchCount += 1;
    }

    sseManager.sendToUser({
      userId,
      event: SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS,
      data: {
        status: 'processing' as const,
        processedCount: allResults.successful.length + allResults.failed.length,
        totalCount,
        failedCount: allResults.failed.length,
      },
    });
  }

  const totalTransactionsProcessed = allResults.successful.length + allResults.failed.length;
  const totalTokens = totalTokenUsage.inputTokens + totalTokenUsage.outputTokens;
  const avgTokensPerTransaction =
    totalTransactionsProcessed > 0 ? Math.round(totalTokens / totalTransactionsProcessed) : 0;

  logger.info('[AI Categorization] Job completed', {
    userId,
    modelId: aiClient.modelId,
    provider: aiClient.provider,
    usingUserKey: aiClient.usingUserKey,
    transactionsProcessed: totalTransactionsProcessed,
    successfulCount: allResults.successful.length,
    failedCount: allResults.failed.length,
    batchCount: totalTokenUsage.batchCount,
    batchSize: BATCH_SIZE,
    totalInputTokens: totalTokenUsage.inputTokens,
    totalOutputTokens: totalTokenUsage.outputTokens,
    totalTokens,
    avgTokensPerTransaction,
  });

  if (allResults.successful.length > 0) {
    trackAiCategorization({
      userId,
      categorizedCount: allResults.successful.length,
      failedCount: allResults.failed.length,
      provider: aiClient.provider,
      usingUserKey: aiClient.usingUserKey,
    });
  }

  return allResults;
}
