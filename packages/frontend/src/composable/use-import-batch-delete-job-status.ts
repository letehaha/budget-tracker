import { getActiveImportBatchDeleteStatus } from '@/api/import-export';
import {
  type BlockingJobWatchdog,
  createBlockingJobWatchdog,
} from '@/composable/blocking-job-watchdog/create-blocking-job-watchdog';
import { SSE_EVENT_TYPES, type ImportBatchDeleteActiveStatus } from '@bt/shared/types';

// Built lazily on first use, not at module top level: this composable sits in the
// api ↔ store import cycle, and a synchronous factory call during that cycle can run
// the factory body before its own `vue` import has initialized (temporal dead zone).
let watchdog: BlockingJobWatchdog<ImportBatchDeleteActiveStatus> | null = null;

// Singleton, same as the base-currency and restore watchdogs: one delete job per user,
// one identical blocking overlay on every open screen. Polling is the only channel; the
// job reports no per-row progress, so an SSE bonus channel would add nothing.
function getWatchdog(): BlockingJobWatchdog<ImportBatchDeleteActiveStatus> {
  if (!watchdog) {
    watchdog = createBlockingJobWatchdog<
      ImportBatchDeleteActiveStatus,
      typeof SSE_EVENT_TYPES.IMPORT_BATCH_DELETE_PROGRESS
    >({
      scope: 'import-batch-delete-status',
      handledJobStorageKey: 'import-batch-delete-handled-job',
      fetchStatus: getActiveImportBatchDeleteStatus,
    });
  }
  return watchdog;
}

/**
 * Shared watchdog for the background import-batch delete. Blocks the app while the
 * job holds the write-lock, then wipes caches and reloads once so nothing acts on
 * balances computed against the deleted rows.
 */
export function useImportBatchDeleteJobStatus() {
  return getWatchdog();
}
