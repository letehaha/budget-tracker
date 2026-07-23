import { getActiveRestoreStatus } from '@/api/backup';
import { createBlockingJobWatchdog } from '@/composable/blocking-job-watchdog/create-blocking-job-watchdog';
import { SSE_EVENT_TYPES, type BackupRestoreActiveStatus, type BackupRestoreSseProgress } from '@bt/shared/types';

/**
 * Map the restore worker's live SSE payload onto the watchdog's status shape. The
 * poll endpoint is authoritative (it carries the summary and the phase from the
 * job's persisted progress); this bonus channel just moves the overlay forward
 * between polls. A `completed` push without a summary yet is reported as running so
 * the wipe+reload never fires with an undefined summary — the next poll carries it.
 */
function sseToStatus(payload: BackupRestoreSseProgress): BackupRestoreActiveStatus | null {
  const { jobId, status, phase, processedCount, summary, error } = payload;
  switch (status) {
    case 'queued':
      return { state: 'queued', jobId };
    case 'running':
      return { state: 'running', jobId, phase, insertedRows: processedCount };
    case 'completed':
      return summary ? { state: 'completed', jobId, summary } : { state: 'running', jobId, phase };
    case 'failed':
      return { state: 'failed', jobId, error: error ?? 'Backup restore failed' };
    default:
      return null;
  }
}

// Module-scoped singleton, same as the base-currency watchdog: one restore per user,
// one identical blocking overlay on every open screen. A restore wipes and replaces
// every table, so the default terminal side effect (full cache wipe + one reload) is
// exactly what it needs — no override.
const watchdog = createBlockingJobWatchdog<BackupRestoreActiveStatus, typeof SSE_EVENT_TYPES.BACKUP_RESTORE_PROGRESS>({
  scope: 'backup-restore-status',
  handledJobStorageKey: 'backup-restore-handled-job',
  fetchStatus: getActiveRestoreStatus,
  sse: {
    event: SSE_EVENT_TYPES.BACKUP_RESTORE_PROGRESS,
    toStatus: sseToStatus,
  },
});

/**
 * Shared watchdog for the data-restore job. On boot (`checkOnBoot`) it blocks the
 * app if a restore is in flight and, if one completed while this device was away,
 * wipes caches and reloads once so nothing acts on the pre-restore dataset. The
 * restore dialog is the rich initiating UI; this watchdog owns the reload / other-
 * tab / closed-tab cases.
 */
export function useRestoreJobStatus() {
  return watchdog;
}
