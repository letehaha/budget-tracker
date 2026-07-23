import { api, API_HTTP } from '@/api/_api';
import { config } from '@/common/config';
import { ApiBaseError } from '@/common/types';
import { ApiErrorResponseError } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import {
  API_ERROR_CODES,
  type BackupRestoreActiveStatus,
  type BackupRestoreStatusResponse,
  parseFilenameFromContentDisposition,
} from '@bt/shared/types';

const API_VER = config.apiVer;
const SESSION_ID_KEY = 'session-id';
const DEFAULT_FILENAME = 'moneymatter-backup.zip';

interface DownloadBackupResult {
  blob: Blob;
  filename: string;
}

/**
 * Shape of the JSON error body the backend returns when the download fails.
 * The standard envelope wraps the error fields under `response`; gateway
 * middleware (e.g. a raw 413) may put them at the top level, so both are read.
 */
type ErrorEnvelope = { response?: ApiBaseError } & Partial<ApiBaseError>;

/**
 * Trigger a full-data backup and return the resulting zip as a Blob.
 *
 * Uses raw `fetch` instead of the shared `ApiCaller` because the response is a
 * binary zip, not the standard `{ status, response }` JSON envelope. On error
 * the server still returns the envelope; we parse it and re-throw via
 * `ApiErrorResponseError` so callers see the same shape as any regular call.
 */
export async function downloadBackup(): Promise<DownloadBackupResult> {
  const url = `${API_HTTP}${API_VER}/user/backup`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': window.sessionStorage?.getItem(SESSION_ID_KEY) || '',
      Accept: 'application/zip, application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    let rawBody: string | null = null;
    let envelope: ErrorEnvelope | null = null;
    try {
      rawBody = await response.text();
      envelope = rawBody ? (JSON.parse(rawBody) as ErrorEnvelope) : null;
    } catch (parseErr) {
      captureException({
        error: parseErr instanceof Error ? parseErr : new Error(String(parseErr)),
        context: {
          feature: 'data-backup',
          stage: 'envelope-parse',
          status: response.status,
          statusText: response.statusText,
          bodyPreview: rawBody?.slice(0, 500) ?? null,
        },
      });
      envelope = null;
    }
    const inner: Partial<ApiBaseError> = envelope?.response ?? envelope ?? {};
    const message = inner.message || `Backup failed (${response.status} ${response.statusText})`;
    const errorPayload: ApiBaseError = {
      message,
      code: inner.code ?? API_ERROR_CODES.unexpected,
      statusText: response.statusText,
      details: inner.details,
    };
    throw new ApiErrorResponseError(message, errorPayload);
  }

  const blob = await response.blob();
  const filename =
    parseFilenameFromContentDisposition({ header: response.headers.get('Content-Disposition') }) ?? DEFAULT_FILENAME;
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
