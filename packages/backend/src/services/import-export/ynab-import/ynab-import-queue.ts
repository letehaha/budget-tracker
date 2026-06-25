import {
  SSE_EVENT_TYPES,
  type YnabAccountMapping,
  type YnabImportProgress,
  type YnabImportSummary,
} from '@bt/shared/types';
import { SentryTraceData } from '@js/utils/sentry';
import { createImportJobQueue } from '@services/import-export/core/queue/create-import-job-queue';
import { randomUUID } from 'node:crypto';

import { executeYnabImport } from './execute-import.service';

interface YnabImportJobData extends SentryTraceData {
  userId: number;
  fileContent: string;
  accountMapping: YnabAccountMapping;
}

const {
  queue: ynabImportQueue,
  worker: ynabImportWorker,
  enqueue,
  getImportProgress,
} = createImportJobQueue<YnabImportJobData, YnabImportSummary, YnabImportProgress>({
  baseName: 'ynab-import',
  sseEventType: SSE_EVENT_TYPES.YNAB_IMPORT_PROGRESS,
  logLabel: 'YNAB Import',
  processJob: async ({ job, onProgress }) => {
    const { userId, fileContent, accountMapping } = job.data;
    return executeYnabImport({
      userId,
      fileContent,
      accountMapping,
      onProgress,
    });
  },
});

export { ynabImportQueue, ynabImportWorker };

/** Public entry point — controller calls this to enqueue an import. */
export async function queueYnabImport({
  userId,
  fileContent,
  accountMapping,
}: {
  userId: number;
  fileContent: string;
  accountMapping: YnabAccountMapping;
}): Promise<string> {
  // Random suffix (not a timestamp): two imports the same user fires within the
  // same millisecond would otherwise collide on one id, and BullMQ silently drops
  // the second `add` for a duplicate jobId — losing the second import with no error.
  const jobId = `ynab-import-${userId}-${randomUUID()}`;
  const data: YnabImportJobData = { userId, fileContent, accountMapping };

  await enqueue({ userId, jobId, data });

  return jobId;
}

/** Fallback polling path: returns the current state of a job for a given user. */
export async function getYnabImportProgress({
  userId,
  jobId,
}: {
  userId: number;
  jobId: string;
}): Promise<YnabImportProgress | null> {
  return getImportProgress({ userId, jobId });
}
