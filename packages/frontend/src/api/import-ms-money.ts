import { api } from '@/api/_api';
import type {
  DetectMsMoneyDuplicatesRequest,
  DetectMsMoneyDuplicatesResponse,
  ExecuteMsMoneyRequest,
  ExecuteMsMoneyResponse,
  MsMoneyImportProgress,
  MsMoneyUploadResponse,
} from '@bt/shared/types';

/** Header carrying the file password. Sent only when the user typed one. */
const FILE_PASSWORD_HEADER = 'x-file-password';

/**
 * Uploads the `.mny` database and gets back the parse result plus the
 * `uploadId` every later step references.
 *
 * The `File` goes out as the raw request body rather than base64 or FormData:
 * a Money database runs to tens of megabytes and any encoding step would hold a
 * second copy of it in the tab's memory.
 */
export const uploadMsMoneyFile = async ({
  file,
  password,
  signal,
}: {
  file: File;
  password?: string;
  signal?: AbortSignal;
}): Promise<MsMoneyUploadResponse> =>
  api.postRaw({
    endpoint: '/import/ms-money/upload',
    body: file,
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(password ? { [FILE_PASSWORD_HEADER]: password } : {}),
    },
    options: { signal },
  });

export const detectMsMoneyDuplicates = async (
  payload: DetectMsMoneyDuplicatesRequest,
): Promise<DetectMsMoneyDuplicatesResponse> => api.post('/import/ms-money/detect-duplicates', payload);

export const executeMsMoneyImport = async (payload: ExecuteMsMoneyRequest): Promise<ExecuteMsMoneyResponse> =>
  api.post('/import/ms-money/execute', payload);

export const getMsMoneyImportStatus = async ({ jobId }: { jobId: string }): Promise<MsMoneyImportProgress> =>
  api.get(`/import/ms-money/status/${jobId}`);
