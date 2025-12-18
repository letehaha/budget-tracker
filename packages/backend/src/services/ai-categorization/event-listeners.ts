import { logger } from '@js/utils/logger';
import { DOMAIN_EVENTS, TransactionsSyncedPayload, eventBus } from '@services/common/event-bus';

import { queueCategorizationJob } from './categorization-queue';

/**
 * Register AI categorization event listeners.
 * Call this once on app startup.
 */
export function registerAiCategorizationListeners(): void {
  eventBus.on(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, handleTransactionsSynced);
  logger.info('AI categorization event listeners registered');
}

/**
 * Handle transactions synced event - queue for AI categorization
 */
async function handleTransactionsSynced(payload: TransactionsSyncedPayload): Promise<void> {
  const { userId, transactionIds } = payload;

  if (transactionIds.length === 0) {
    return;
  }

  try {
    await queueCategorizationJob({ userId, transactionIds });
    logger.info(`Queued ${transactionIds.length} transactions for AI categorization`);
  } catch (error) {
    // Don't fail - just log the error. AI categorization is non-critical.
    logger.error({
      message: 'Failed to queue AI categorization after transactions sync',
      error: error as Error,
    });
  }
}
