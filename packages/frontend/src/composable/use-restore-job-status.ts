import { getActiveRestoreStatus } from '@/api/backup';
import {
  type BlockingJobWatchdog,
  createBlockingJobWatchdog,
} from '@/composable/blocking-job-watchdog/create-blocking-job-watchdog';
import { i18n } from '@/i18n';
import { SSE_EVENT_TYPES, type BackupRestoreActiveStatus, type BackupRestoreSseProgress } from '@bt/shared/types';

/**
 * Map the restore worker's live SSE payload onto the watchdog's status shape. The
 * poll endpoint is authoritative (it carries the summary and the phase from the
 * job's persisted progress); this bonus channel just moves the overlay forward
 * between polls. A `completed` push without a summary yet is reported as running so
 * the wipe+reload never fires with an undefined summary — the next poll carries it.
 *
 * Exported for unit tests: it is a pure mapping and each SSE branch is worth pinning.
 */
export function sseToStatus(payload: BackupRestoreSseProgress): BackupRestoreActiveStatus | null {
  const { jobId, status, phase, processedCount, summary, error } = payload;
  switch (status) {
    case 'queued':
      return { state: 'queued', jobId };
    case 'running':
      return { state: 'running', jobId, phase, insertedRows: processedCount };
    case 'completed':
      return summary ? { state: 'completed', jobId, summary } : { state: 'running', jobId, phase };
    case 'failed':
      // A `failed` push without a reason falls back to the localized generic message
      // so the overlay's failure panel never renders a raw English string.
      return {
        state: 'failed',
        jobId,
        error: error ?? i18n.global.t('settings.security.backup.restore.failedGeneric'),
      };
    default:
      return null;
  }
}

// Built lazily on first use, not at module top level: this composable and the
// base-currency one both sit in the api ↔ store import cycle, and a second
// synchronous factory call during that cycle runs the factory body before the
// factory module's own `vue` import has initialized (temporal dead zone). Deferring
// to first call means the watchdog is created after the graph has fully loaded.
let watchdog: BlockingJobWatchdog<BackupRestoreActiveStatus> | null = null;

// Singleton, same as the base-currency watchdog: one restore per user, one identical
// blocking overlay on every open screen. A restore wipes and replaces every table, so
// the default terminal side effect (full cache wipe + one reload) is exactly what it
// needs — no override.
function getWatchdog(): BlockingJobWatchdog<BackupRestoreActiveStatus> {
  if (!watchdog) {
    watchdog = createBlockingJobWatchdog<BackupRestoreActiveStatus, typeof SSE_EVENT_TYPES.BACKUP_RESTORE_PROGRESS>({
      scope: 'backup-restore-status',
      handledJobStorageKey: 'backup-restore-handled-job',
      fetchStatus: getActiveRestoreStatus,
      sse: {
        event: SSE_EVENT_TYPES.BACKUP_RESTORE_PROGRESS,
        toStatus: sseToStatus,
      },
    });
  }
  return watchdog;
}

/**
 * Shared watchdog for the data-restore job. On boot (`checkOnBoot`) it blocks the
 * app if a restore is in flight and, if one completed while this device was away,
 * wipes caches and reloads once so nothing acts on the pre-restore dataset. The
 * restore dialog is the rich initiating UI; this watchdog owns the reload / other-
 * tab / closed-tab cases.
 */
export function useRestoreJobStatus() {
  return getWatchdog();
}
