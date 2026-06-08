import { exportData, type ExportDataPayload } from '@/api/data-export';
import { downloadBlob } from '@/common/utils/download-file';
import { ApiErrorResponseError } from '@/js/errors';
import { useMutation } from '@tanstack/vue-query';

export class DataExportDownloadFailedError extends Error {
  constructor(public readonly cause: unknown) {
    super('Data export blob downloaded but the browser could not start the file download.');
    this.name = 'DataExportDownloadFailedError';
  }
}

type DataExportError = ApiErrorResponseError | DataExportDownloadFailedError;

type ExportResult = Awaited<ReturnType<typeof exportData>>;

/**
 * Wrapper around the data-export mutation that pipes the resulting Blob
 * straight into a browser download. The mutation is read-only on the server
 * side (no cache invalidation needed) and returns the response metadata
 * unmodified so the caller can show e.g. a "downloaded X rows" toast.
 *
 * The browser-download step happens inside `mutationFn` (not `onSuccess`) so
 * any failure there propagates to the caller's `onError` handler – vue-query
 * silently swallows exceptions thrown inside `onSuccess`, which would leave
 * the user with a success toast and no file.
 */
export function useDataExport() {
  return useMutation<ExportResult, DataExportError, ExportDataPayload>({
    mutationFn: async (payload) => {
      const result = await exportData(payload);
      try {
        downloadBlob({ blob: result.blob, filename: result.filename });
      } catch (downloadErr) {
        throw new DataExportDownloadFailedError(downloadErr);
      }
      return result;
    },
  });
}
