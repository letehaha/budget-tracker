import { api } from '@/api/_api';
import { fetchZipDownload } from '@/api/_zip-download';
import type { BackupRestoreActiveStatus, BackupRestoreStatusResponse } from '@bt/shared/types';

const DEFAULT_FILENAME = 'moneymatter-backup.zip';

interface DownloadBackupResult {
  blob: Blob;
  filename: string;
}

/** Trigger a full-data backup and return the resulting zip as a Blob. */
export async function downloadBackup(): Promise<DownloadBackupResult> {
  const { blob, filename } = await fetchZipDownload({
    path: '/user/backup',
    feature: 'data-backup',
    defaultFilename: DEFAULT_FILENAME,
  });
  return { blob, filename };
}

/**
 * Queue an async restore of a base64-encoded backup zip. Returns the job id
 * used to poll `getRestoreStatus`.
 *
 * A 409 (`wipeDataSharingAcknowledgementRequired`) means the user owns shared
 * resources; the caller re-sends with `acknowledgeSharing: true`. A 422 carries
 * a human-readable reason (bad zip, incompatible version, checksum mismatch).
 */
export async function restoreBackup({
  fileContent,
  acknowledgeSharing,
}: {
  fileContent: string;
  acknowledgeSharing?: boolean;
}): Promise<{ jobId: string }> {
  return api.post('/user/backup/restore', {
    fileContent,
    ...(acknowledgeSharing !== undefined ? { acknowledgeSharing } : {}),
  });
}

/** Poll the status of a queued restore job. */
export async function getRestoreStatus({ jobId }: { jobId: string }): Promise<BackupRestoreStatusResponse> {
  return api.get(`/user/backup/restore/status/${jobId}`);
}

/**
 * User-scoped restore status (no job id). Polled on every boot to drive the
 * blocking overlay when a restore is in flight, or to wipe + reload once when one
 * completed while this device was away. Never 404s — returns `idle` when nothing runs.
 */
export async function getActiveRestoreStatus(): Promise<BackupRestoreActiveStatus> {
  return api.get('/user/backup/restore/status');
}
