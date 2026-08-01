import { AI_FEATURE, AI_PROVIDER, CATEGORIZATION_SOURCE, SSE_EVENT_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { trackAiCategorization } from '@js/utils/posthog';
import Accounts from '@models/accounts.model';
import { getCategories } from '@models/categories.model';
import Payees from '@models/payees.model';
import Transactions from '@models/transactions.model';
import {
  AIClientResult,
  type AiCallFailureKind,
  CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE,
  aiCallGuards,
  buildModelNotServedMessage,
  classifyAiCallFailure,
  createAIClient,
  describeMissingAiConfiguration,
  markCustomEndpointUnreachable,
} from '@services/ai';
import { sseManager } from '@services/common/sse';
import { markApiKeyInvalid, markApiKeyValid } from '@services/user-settings/ai-api-key';
import { markCustomEndpointInvalid, markCustomEndpointValid } from '@services/user-settings/ai-custom-endpoint';
import { getCustomInstructions } from '@services/user-settings/ai-custom-instructions';
import { generateText } from 'ai';

import { buildSystemPrompt, buildUserMessage } from './prompt-builder';
import {
  CategorizationBatchResult,
  CategorizationProgress,
  CategorizationResult,
  TransactionForCategorization,
} from './types';
import { assignShortIds } from './utils/assign-short-ids';
import { buildCategoryList } from './utils/build-category-list';
import { parseCategorizationResponse } from './utils/parse-response';

const INVALID_KEY_ERROR_MESSAGE =
  'API key is not working. Please verify the key is correct, has sufficient credits, and has the required permissions.';

/** A local endpoint often has no key at all, so credits and permissions are the wrong advice. */
const CUSTOM_ENDPOINT_REJECTED_ERROR_MESSAGE =
  'Your custom AI endpoint rejected the request. Please verify its URL, model name, and API key in AI settings.';

const CUSTOM_ENDPOINT_ADDRESS_BLOCKED_ERROR_MESSAGE =
  'Your custom AI endpoint address was rejected. Please point it at a publicly reachable address in AI settings.';

const RATE_LIMITED_ERROR_MESSAGE = 'AI provider rate limit reached. Please try again in a few minutes.';

const TEMPORARY_ERROR_MESSAGE = 'AI provider temporarily unavailable. Please try again later.';

// Batch size of 500 provides ~9k tokens per batch (average case, with short
// alias ids). Well within safe limits for AI models while providing good
// progress feedback
const BATCH_SIZE = 500;

interface CategorizeBatchResult extends CategorizationBatchResult {
  /** How the AI call failed, when it did. Anything but `unknown` repeats on the next batch. */
  failureKind?: AiCallFailureKind;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

function buildStopReason({
  failureKind,
  aiClient,
}: {
  failureKind: Exclude<AiCallFailureKind, 'unknown'>;
  aiClient: AIClientResult;
}): string {
  switch (failureKind) {
    case 'blocked-address':
      return CUSTOM_ENDPOINT_ADDRESS_BLOCKED_ERROR_MESSAGE;
    case 'model-not-found':
      return buildModelNotServedMessage({ modelId: aiClient.modelId });
    case 'endpoint-down':
      return CUSTOM_ENDPOINT_UNREACHABLE_ERROR_MESSAGE;
    case 'rate-limited':
      return RATE_LIMITED_ERROR_MESSAGE;
    case 'temporary':
      return TEMPORARY_ERROR_MESSAGE;
    case 'auth':
      return aiClient.provider === AI_PROVIDER.custom
        ? CUSTOM_ENDPOINT_REJECTED_ERROR_MESSAGE
        : INVALID_KEY_ERROR_MESSAGE;
  }
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
  const shortIds = assignShortIds({ transactions, categories: categoryList });

  const systemPrompt = buildSystemPrompt({ customInstructions });
  const userMessage = buildUserMessage({
    transactions: shortIds.aliasedTransactions,
    categories: shortIds.aliasedCategories,
  });

  try {
    // A hung or trickling endpoint must abort instead of pinning a worker slot forever.
    const { abortSignal, maxRetries } = aiCallGuards({ provider: aiClient.provider });

    const { text, usage } = await generateText({
      model: aiClient.model,
      system: systemPrompt,
      prompt: userMessage,
      abortSignal,
      maxRetries,
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

    const aliasResults = parseCategorizationResponse({
      response: text,
      validCategoryIds: new Set(shortIds.categoryIdByAlias.keys()),
      validTransactionIds: new Set(shortIds.transactionIdByAlias.keys()),
    });

    const results = aliasResults.map((result) => ({
      transactionId: shortIds.transactionIdByAlias.get(result.transactionId)!,
      categoryId: shortIds.categoryIdByAlias.get(result.categoryId)!,
    }));

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
    const { kind, cause } = classifyAiCallFailure({ error });

    // Only a custom endpoint can be down in a way the user can fix, so a catalog
    // provider that answers with nothing is downgraded to a temporary failure.
    const failureKind =
      kind === 'endpoint-down' && aiClient.provider !== AI_PROVIDER.custom ? ('temporary' as const) : kind;

    if (failureKind === 'unknown') {
      logger.error({ message: 'AI categorization batch failed', error: cause });
    } else {
      // Expected user config or provider state, handled by the caller, so info keeps it out of Sentry.
      logger.info(`AI categorization batch failed (${failureKind}): ${cause.message}`);
    }

    return {
      successful: [],
      failed: transactions.map((t) => t.id),
      errors: [failureKind === 'blocked-address' ? CUSTOM_ENDPOINT_ADDRESS_BLOCKED_ERROR_MESSAGE : cause.message],
      failureKind,
    };
  }
}

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
 * Categorize transactions using AI, in batches of BATCH_SIZE. The first classified
 * failure stops the run and returns partial results with `stopReason` set. An auth
 * failure on a catalog user key retries once on the server key; a custom endpoint
 * never falls back.
 */
export async function categorizeTransactions({
  userId,
  transactionIds,
  totalTransactionCount,
  onProgress,
}: {
  userId: number;
  transactionIds: string[];
  /** For progress tracking. Defaults to transactionIds.length */
  totalTransactionCount?: number;
  onProgress?: (progress: CategorizationProgress) => void | Promise<void>;
}): Promise<CategorizationBatchResult> {
  const totalCount = totalTransactionCount ?? transactionIds.length;
  let aiClient = await createAIClient({
    userId,
    feature: AI_FEATURE.categorization,
  });

  if (!aiClient) {
    // Routinely the user's own state (no key configured, endpoints flagged down), and
    // warn would report every such run to Sentry.
    logger.info('No AI provider available for categorization', { userId });
    const missingConfigurationMessage = await describeMissingAiConfiguration({ userId });
    return {
      successful: [],
      failed: transactionIds,
      errors: [missingConfigurationMessage],
      stopReason: missingConfigurationMessage,
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
      stopReason: 'No categories configured',
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

  const reportProcessing = async () => {
    const progress: CategorizationProgress = {
      processedCount: allResults.successful.length + allResults.failed.length,
      totalCount,
      failedCount: allResults.failed.length,
    };
    sseManager.sendToUser({
      userId,
      event: SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS,
      data: { status: 'processing' as const, ...progress },
    });
    // Progress is cosmetic, so a failing sink must not abort the run and discard finished batches.
    try {
      await onProgress?.(progress);
    } catch (error) {
      logger.error({
        message: `[AI Categorization] Failed to report progress for user ${userId}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  };

  // Guards against an infinite fallback loop
  let hasTriedFallback = false;

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(transactions.length / BATCH_SIZE)}`);

    // Reported before the LLM call: a single batch can run for minutes on a slow
    // model, and the UI would otherwise sit on "queued" that whole time.
    await reportProcessing();

    const batchResult = await categorizeBatch({
      aiClient,
      transactions: batch,
      categories,
      customInstructions,
    });

    // Auth on a catalog user key gets one shot at the server key. A user who
    // configured their own endpoint chose where their data may go, so falling
    // back would send payees, amounts and notes to a provider they never picked.
    if (
      batchResult.failureKind === 'auth' &&
      aiClient.usingUserKey &&
      aiClient.provider !== AI_PROVIDER.custom &&
      !hasTriedFallback
    ) {
      logger.info('User AI credentials rejected, marking invalid', { userId, provider: aiClient.provider });

      await markApiKeyInvalid({
        userId,
        provider: aiClient.provider,
        errorMessage: INVALID_KEY_ERROR_MESSAGE,
      });

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
      // No server key either: fall through to the stop block below
    }

    // A classified failure holds for the whole run (the endpoint stays down, the model
    // stays missing), so the first one stops it. Unclassified ones may be batch-specific.
    if (batchResult.failureKind && batchResult.failureKind !== 'unknown') {
      const stopReason = buildStopReason({ failureKind: batchResult.failureKind, aiClient });

      logger.info(`Stopping AI categorization (${batchResult.failureKind}): ${stopReason}`, {
        userId,
        provider: aiClient.provider,
        modelId: aiClient.modelId,
        usingUserKey: aiClient.usingUserKey,
      });

      if (batchResult.failureKind === 'endpoint-down') {
        await markCustomEndpointUnreachable({ userId, aiClient });
      } else if (
        batchResult.failureKind === 'auth' &&
        aiClient.provider === AI_PROVIDER.custom &&
        aiClient.customEndpointId
      ) {
        await markCustomEndpointInvalid({
          userId,
          endpointId: aiClient.customEndpointId,
          errorMessage: stopReason,
        });
      }

      allResults.failed.push(...transactions.slice(i).map((t) => t.id));
      allResults.errors!.push(stopReason);
      allResults.stopReason = stopReason;
      break;
    }

    if (batchResult.successful.length > 0) {
      await applyCategorizationResults({ results: batchResult.successful });

      if (aiClient.usingUserKey) {
        if (aiClient.provider === AI_PROVIDER.custom) {
          if (aiClient.customEndpointId) {
            await markCustomEndpointValid({ userId, endpointId: aiClient.customEndpointId });
          }
        } else {
          await markApiKeyValid({ userId, provider: aiClient.provider });
        }
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
