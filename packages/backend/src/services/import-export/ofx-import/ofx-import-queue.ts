import type { ExecuteOfxRequest, OfxImportProgress, OfxImportSummary } from '@bt/shared/types';
import { SSE_EVENT_TYPES } from '@bt/shared/types';
import { SentryTraceData } from '@js/utils/sentry';
import { createImportJobQueue } from '@services/import-export/core/queue/create-import-job-queue';
import { randomUUID } from 'node:crypto';

import { executeOfxImport } from './execute-import.service';
import { claimOfxUpload } from './upload-cache';

type OfxImportRequest = ExecuteOfxRequest & { userId: number };
type OfxImportJobData = OfxImportRequest & SentryTraceData;

const queueTails = new Map<string, Promise<void>>();

// Keep the upload claim and job enqueue atomic for one user/upload pair. This
// prevents two concurrent execute requests from both claiming the same upload.
async function serializeOfxUpload<T>({ key, operation }: { key: string; operation: () => Promise<T> }): Promise<T> {
  const previous = queueTails.get(key) ?? Promise.resolve();
  const result = previous.then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  queueTails.set(key, tail);

  try {
    return await result;
  } finally {
    if (queueTails.get(key) === tail) queueTails.delete(key);
  }
}

const { queue, worker, enqueue, getImportProgress } = createImportJobQueue<
  OfxImportJobData,
  OfxImportSummary,
  OfxImportProgress
>({
  baseName: 'ofx-import',
  sseEventType: SSE_EVENT_TYPES.OFX_IMPORT_PROGRESS,
  logLabel: 'OFX Import',
  processJob: ({ job, onProgress }) => executeOfxImport({ ...job.data, onProgress }),
});

export { queue as ofxImportQueue, worker as ofxImportWorker };

export async function getOfxImportProgress({
  userId,
  jobId,
}: {
  userId: number;
  jobId: string;
}): Promise<OfxImportProgress | null> {
  return getImportProgress({ userId, jobId });
}

export async function queueOfxImport({ userId, ...request }: OfxImportRequest): Promise<string> {
  return serializeOfxUpload({
    key: `${userId}:${request.uploadId}`,
    operation: async () => {
      const jobId = `ofx-import-${userId}-${randomUUID()}`;
      await claimOfxUpload({
        userId,
        uploadId: request.uploadId,
        jobId,
        isClaimStale: async ({ jobId: claimedJobId }) => {
          const progress = await getOfxImportProgress({ userId, jobId: claimedJobId });
          return progress === null || progress.status === 'failed';
        },
      });
      await enqueue({ userId, jobId, data: { userId, ...request } });
      return jobId;
    },
  });
}
