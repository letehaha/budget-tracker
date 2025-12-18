import { CATEGORIZATION_SOURCE } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/Accounts.model';
import { getCategories } from '@models/Categories.model';
import Transactions from '@models/Transactions.model';
import { getAiApiKey } from '@services/user-settings/ai-api-key';

import { AnthropicClient, AnthropicClientModel } from './anthropic-client';
import { buildSystemPrompt, buildUserMessage } from './prompt-builder';
import { CategorizationBatchResult, CategorizationResult, TransactionForCategorization } from './types';
import { buildCategoryList } from './utils/build-category-list';
import { parseCategorizationResponse } from './utils/parse-response';

// Not strong meaning here, just a value to avoid huge payloads
const BATCH_SIZE = 200;

/**
 * Categorize a batch of transactions using AI
 */
async function categorizeBatch({
  apiKey,
  transactions,
  categories,
}: {
  apiKey: string;
  transactions: TransactionForCategorization[];
  categories: Awaited<ReturnType<typeof getCategories>>;
}): Promise<CategorizationBatchResult> {
  /**
   * Use `AnthropicClientModel.haiku` for better speed and cheaper API price
   */
  const client = new AnthropicClient({ apiKey, model: AnthropicClientModel.haiku });

  const categoryList = buildCategoryList(categories);

  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage({
    transactions,
    categories: categoryList,
  });

  try {
    const response = await client.sendMessage({ systemPrompt, userMessage });

    const validCategoryIds = new Set(categories.map((c) => c.id));
    const validTransactionIds = new Set(transactions.map((t) => t.id));

    const results = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    const successfulIds = new Set(results.map((r) => r.transactionId));
    const failed = transactions.filter((t) => !successfulIds.has(t.id)).map((t) => t.id);

    return {
      successful: results,
      failed,
    };
  } catch (error) {
    logger.error({ message: 'AI categorization batch failed', error: error as Error });
    return {
      successful: [],
      failed: transactions.map((t) => t.id),
      errors: [(error as Error).message],
    };
  }
}

/**
 * Apply categorization results to transactions
 * Groups by categoryId for efficient bulk updates
 */
async function applyCategorizationResults({
  results,
  userId,
}: {
  results: CategorizationResult[];
  userId: number;
}): Promise<void> {
  if (results.length === 0) return;

  const now = new Date().toISOString();

  // Group transaction IDs by categoryId
  const groupedByCategory = new Map<number, number[]>();
  for (const result of results) {
    if (!groupedByCategory.has(result.categoryId)) {
      groupedByCategory.set(result.categoryId, []);
    }
    groupedByCategory.get(result.categoryId)!.push(result.transactionId);
  }

  // Bulk update per category (parallel)
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
          where: { id: transactionIds, userId },
          // Disable hooks to avoid unnecessary balance recalculations
          // Category change doesn't affect balances
          individualHooks: false,
        },
      ),
    ),
  );
}

/**
 * Get uncategorized transactions for a user
 * A transaction is considered uncategorized if its categoryId matches the user's default category
 */
async function getUncategorizedTransactions({
  userId,
  transactionIds,
}: {
  userId: number;
  transactionIds: number[];
}): Promise<TransactionForCategorization[]> {
  const transactions = await Transactions.findAll({
    where: {
      id: transactionIds,
      userId,
      // Only get transactions that haven't been AI-categorized before
      categorizationMeta: null,
    },
    include: [
      {
        model: Accounts,
        attributes: ['name'],
      },
    ],
    raw: true,
    attributes: ['id', 'amount', 'currencyCode', 'time', 'note', 'accountId'],
  });

  return transactions.map((tx) => ({
    id: tx.id,
    amount: tx.amount,
    currencyCode: tx.currencyCode,
    accountName: (tx as unknown as { account?: { name: string } }).account?.name || 'Unknown',
    datetime: tx.time.toISOString(),
    note: tx.note,
  }));
}

/**
 * Main function to categorize transactions for a user
 * Processes transactions in batches
 */
export async function categorizeTransactions({
  userId,
  transactionIds,
}: {
  userId: number;
  transactionIds: number[];
}): Promise<CategorizationBatchResult> {
  // Get the user's AI API key
  const apiKey = await getAiApiKey({ userId });
  if (!apiKey) {
    logger.info(`User ${userId} has no AI API key configured, skipping categorization`);
    return {
      successful: [],
      failed: transactionIds,
      errors: ['No AI API key configured'],
    };
  }

  // Get user's categories
  const categories = await getCategories({ userId });
  if (categories.length === 0) {
    logger.info(`User ${userId} has no categories, skipping categorization`);
    return {
      successful: [],
      failed: transactionIds,
      errors: ['No categories configured'],
    };
  }

  // Get uncategorized transactions
  const transactions = await getUncategorizedTransactions({ userId, transactionIds });
  if (transactions.length === 0) {
    logger.info(`No uncategorized transactions to process for user ${userId}`);
    return {
      successful: [],
      failed: [],
    };
  }

  logger.info(`Starting AI categorization for ${transactions.length} transactions for user ${userId}`);

  const allResults: CategorizationBatchResult = {
    successful: [],
    failed: [],
    errors: [],
  };

  // Process in batches
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(transactions.length / BATCH_SIZE)}`);

    const batchResult = await categorizeBatch({
      apiKey,
      transactions: batch,
      categories,
    });

    // Apply successful categorizations immediately
    if (batchResult.successful.length > 0) {
      await applyCategorizationResults({ results: batchResult.successful, userId });
    }

    allResults.successful.push(...batchResult.successful);
    allResults.failed.push(...batchResult.failed);
    if (batchResult.errors) {
      allResults.errors!.push(...batchResult.errors);
    }
  }

  logger.info(
    `AI categorization complete for user ${userId}: ${allResults.successful.length} successful, ${allResults.failed.length} failed`,
  );

  return allResults;
}
