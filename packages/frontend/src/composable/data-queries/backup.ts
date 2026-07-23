import { downloadBackup, getRestoreStatus, restoreBackup } from '@/api/backup';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { downloadBlob } from '@/common/utils/download-file';
import { ApiErrorResponseError } from '@/js/errors';
import type { BackupRestoreStatusResponse } from '@bt/shared/types';
import { useMutation, useQuery } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';

const RESTORE_POLL_INTERVAL_MS = 1500;

export class BackupDownloadFailedError extends Error {
  constructor(public readonly cause: unknown) {
    super('Backup blob downloaded but the browser could not start the file download.');
    this.name = 'BackupDownloadFailedError';
  }
}

type BackupDownloadError = ApiErrorResponseError | BackupDownloadFailedError;
type DownloadResult = Awaited<ReturnType<typeof downloadBackup>>;

/**
 * Download a full-data backup and pipe the resulting Blob into a browser
 * download. Mirrors `useDataExport`: the download step runs inside `mutationFn`
 * (not `onSuccess`) so a failure there reaches the caller's `onError` — vue-query
 * swallows exceptions thrown in `onSuccess`, which would leave a success toast
 * with no file.
 */
export function useBackupDownload() {
  return useMutation<DownloadResult, BackupDownloadError, void>({
    mutationFn: async () => {
      const result = await downloadBackup();
      try {
        downloadBlob({ blob: result.blob, filename: result.filename });
      } catch (downloadErr) {
        throw new BackupDownloadFailedError(downloadErr);
      }
      return result;
    },
  });
}

/** Queue a restore from a base64-encoded backup zip. */
export function useRestoreBackup() {
  return useMutation<{ jobId: string }, Error, { fileContent: string; acknowledgeSharing?: boolean }>({
    mutationFn: (payload) => restoreBackup(payload),
  });
}

// Retries per poll cycle before the query enters its error state. Tolerates a
// brief blip but lets a genuinely-down status endpoint surface as `isError`.
const RESTORE_POLL_RETRIES = 3;

/**
 * Poll a restore job's status while it's `pending`/`processing`, stopping once
 * it reaches `completed` or `failed`. The query stays disabled until `jobId`
 * is set.
 *
 * The full query result is returned on purpose: callers watch `isError`/`error`
 * (not just `data`) so a persistently-failing poll surfaces a terminal error
 * instead of spinning forever with no successful terminal payload.
 */
export function useRestoreStatus({ jobId }: { jobId: Ref<string | null> }) {
  return useQuery<BackupRestoreStatusResponse>({
    queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.backupRestoreStatus, jobId.value]),
    queryFn: () => getRestoreStatus({ jobId: jobId.value as string }),
    enabled: computed(() => Boolean(jobId.value)),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return RESTORE_POLL_INTERVAL_MS;
    },
    retry: RESTORE_POLL_RETRIES,
    // Each restore job is a one-shot lifecycle; don't retain the terminal status
    // across job ids or the next restore would flash the previous run's summary.
    gcTime: 0,
    staleTime: 0,
  });
}
