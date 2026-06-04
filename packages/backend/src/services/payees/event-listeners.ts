import { logger } from '@js/utils/logger';
import { DOMAIN_EVENTS, TransactionsSyncedPayload, eventBus } from '@services/common/event-bus';
import { getUserSettings } from '@services/user-settings/get-user-settings';

import { runTypeBFuzzyPass } from './type-b-pass';

const DEBOUNCE_MS = 4000;

const pendingTransactions = new Map<number, Set<string>>();
const debounceTimers = new Map<number, NodeJS.Timeout>();

/**
 * Register Payee Type B event listeners.
 *
 * The Type B pass runs after `TRANSACTIONS_SYNCED` with a small debounce so
 * multiple accounts syncing in quick succession produce a single batch
 * instead of one pass per account. Runs at lower priority than the primary
 * extraction (which already ran inside createTransaction during the sync).
 */
export function registerPayeeTypeBListeners(): void {
  eventBus.on(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, handleTransactionsSynced);
  logger.info('Payee Type B event listeners registered');
}

function handleTransactionsSynced(payload: TransactionsSyncedPayload): void {
  const { userId, transactionIds } = payload;
  if (transactionIds.length === 0) return;

  const bucket = pendingTransactions.get(userId) ?? new Set<string>();
  for (const id of transactionIds) bucket.add(id);
  pendingTransactions.set(userId, bucket);

  const existingTimer = debounceTimers.get(userId);
  if (existingTimer) clearTimeout(existingTimer);

  debounceTimers.set(
    userId,
    setTimeout(() => flushPendingTypeBBatch(userId), DEBOUNCE_MS),
  );
}

async function flushPendingTypeBBatch(userId: number): Promise<void> {
  const bucket = pendingTransactions.get(userId);
  debounceTimers.delete(userId);
  pendingTransactions.delete(userId);
  if (!bucket || bucket.size === 0) return;

  try {
    // Type B uses `note` (transaction description) as the fuzzy-match signal,
    // so it's only valid when the user has opted into description-driven
    // Payee inference. For strict users (default), this pass is a no-op.
    const settings = await getUserSettings({ userId });
    if (!settings.payeeExtractionUsesDescription) {
      logger.info('[Payee Type B] skipped: user has not opted into description-based extraction', {
        userId,
        bucketSize: bucket.size,
      });
      return;
    }

    const result = await runTypeBFuzzyPass({ userId, transactionIds: Array.from(bucket) });
    logger.info('[Payee Type B] batch complete', {
      userId,
      scanned: result.scanned,
      linked: result.linked,
    });
  } catch (error) {
    logger.error({
      message: '[Payee Type B] batch failed',
      error: error as Error,
    });
  }
}
