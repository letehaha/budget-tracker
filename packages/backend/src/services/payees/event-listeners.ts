import { logger } from '@js/utils/logger';
import { DOMAIN_EVENTS, TransactionsSyncedPayload, eventBus } from '@services/common/event-bus';
import { getUserSettings } from '@services/user-settings/get-user-settings';

import { runNoteFuzzyBackfill } from './note-fuzzy-backfill';

const DEBOUNCE_MS = 4000;
const LOG_PREFIX = '[Payee note-backfill]';

const pendingTransactions = new Map<number, Set<string>>();
const debounceTimers = new Map<number, NodeJS.Timeout>();

/**
 * Register the post-sync note fuzzy backfill listeners.
 *
 * Runs after `TRANSACTIONS_SYNCED` with a small debounce so multiple
 * accounts syncing in quick succession produce a single batch instead of
 * one pass per account. Lower priority than the inline sync-time
 * extraction inside `createTransaction`, which has already run for these
 * rows — this pass only fills the gap for rows where the provider's
 * dedicated merchant column was empty and the user has opted into using
 * `description` (note) as the fuzzy-match source.
 *
 * Scoping: the backfill processes every uncategorized row on accounts
 * the requesting user *owns* — `runNoteFuzzyBackfill` joins `Accounts`
 * and gates by `Account.userId`, so a shared-account row authored by a
 * recipient is still picked up under the owner's pass. Matches the same
 * pattern used by `ai-categorization/event-listeners.ts`.
 */
export function registerPayeeNoteBackfillListeners(): void {
  eventBus.on(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, handleTransactionsSynced);
  logger.info('Payee note-backfill event listeners registered');
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
    setTimeout(() => flushPendingNoteBackfillBatch(userId), DEBOUNCE_MS),
  );
}

async function flushPendingNoteBackfillBatch(userId: number): Promise<void> {
  const bucket = pendingTransactions.get(userId);
  debounceTimers.delete(userId);
  pendingTransactions.delete(userId);
  if (!bucket || bucket.size === 0) return;

  try {
    // The note-based backfill uses `note` (transaction description) as the
    // fuzzy-match signal, so it's only valid when the user has opted into
    // description-driven Payee inference. For strict users (default), this
    // pass is a no-op.
    const settings = await getUserSettings({ userId });
    if (!settings.payeeExtractionUsesDescription) {
      logger.info(`${LOG_PREFIX} skipped: user has not opted into description-based extraction`, {
        userId,
        bucketSize: bucket.size,
      });
      return;
    }

    const result = await runNoteFuzzyBackfill({ userId, transactionIds: Array.from(bucket) });
    logger.info(`${LOG_PREFIX} batch complete`, {
      userId,
      scanned: result.scanned,
      linked: result.linked,
    });
  } catch (error) {
    logger.error({
      message: `${LOG_PREFIX} batch failed`,
      error: error as Error,
    });
  }
}
