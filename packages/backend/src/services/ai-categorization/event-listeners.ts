import { logger } from '@js/utils/logger';
import { DOMAIN_EVENTS, TransactionsSyncedPayload, eventBus } from '@services/common/event-bus';

import { queueCategorizationJob } from './categorization-queue';

const DEBOUNCE_MS = 4000;

// Per-user buffers: accumulate transaction IDs across rapid sync events
const pendingTransactions = new Map<number, number[]>();
const debounceTimers = new Map<number, NodeJS.Timeout>();

/**
 * Register AI categorization event listeners.
 * Call this once on app startup.
 */
export function registerAiCategorizationListeners(): void {
  eventBus.on(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, handleTransactionsSynced);
  logger.info('AI categorization event listeners registered');
}

/**
 * Handle transactions synced event.
 * Accumulates transaction IDs per user and debounces before queuing,
 * so multiple accounts syncing in rapid succession produce a single
 * categorization job instead of one per account.
 */
function handleTransactionsSynced(payload: TransactionsSyncedPayload): void {
  const { userId, transactionIds } = payload;

  if (transactionIds.length === 0) {
    return;
  }

  // Accumulate into per-user buffer
  const existing = pendingTransactions.get(userId) ?? [];
  existing.push(...transactionIds);
  pendingTransactions.set(userId, existing);

  // Reset debounce timer
  const existingTimer = debounceTimers.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  debounceTimers.set(
    userId,
    setTimeout(() => flushPendingTransactions(userId), DEBOUNCE_MS),
  );

  logger.info(
    `Buffered ${transactionIds.length} transactions for AI categorization (user ${userId}, total buffered: ${existing.length})`,
  );
}

/**
 * Flush accumulated transactions for a user into a single categorization job.
 */
async function flushPendingTransactions(userId: number): Promise<void> {
  const transactionIds = pendingTransactions.get(userId);
  debounceTimers.delete(userId);
  pendingTransactions.delete(userId);

  if (!transactionIds || transactionIds.length === 0) {
    return;
  }

  try {
    await queueCategorizationJob({ userId, transactionIds });
    logger.info(`Queued ${transactionIds.length} transactions for AI categorization (user ${userId}, debounced)`);
  } catch (error) {
    logger.error({
      message: 'Failed to queue AI categorization after transactions sync',
      error: error as Error,
    });
  }
}

/**
 * Flush all pending buffers immediately and clear timers.
 * Used in tests to avoid dangling timers.
 */
export async function flushAllPendingCategorizationBuffers(): Promise<void> {
  for (const [, timer] of debounceTimers) {
    clearTimeout(timer);
  }

  const flushPromises = Array.from(pendingTransactions.keys()).map((userId) => flushPendingTransactions(userId));

  await Promise.all(flushPromises);
}
