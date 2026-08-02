import {
  type CategoryMappingConfig,
  type MsMoneyAccountMapping,
  type MsMoneyImportProgress,
  type MsMoneyImportSummary,
  SSE_EVENT_TYPES,
} from '@bt/shared/types';
import { SentryTraceData } from '@js/utils/sentry';
import { createImportJobQueue } from '@services/import-export/core/queue/create-import-job-queue';
import { randomUUID } from 'node:crypto';

import { executeMsMoneyImport } from './execute-import.service';
import { assertMsMoneyUploadExists } from './upload-cache';

interface MsMoneyImportJobData extends SentryTraceData {
  userId: number;
  /** Id of the server-side cached parse result. A `.mny` file can be tens of
   *  megabytes, so the job payload references it instead of carrying the bytes
   *  through Redis. */
  uploadId: string;
  accountMapping: MsMoneyAccountMapping;
  categoryMapping: CategoryMappingConfig;
  skipDuplicateIndices: number[];
  /** When true, rows dated on/after a linked account's pre-import boundary move
   *  its current balance; when false/absent the pre-import balance is preserved. */
  recalculateBalance?: boolean;
}

const {
  queue: msMoneyImportQueue,
  worker: msMoneyImportWorker,
  enqueue,
  getImportProgress,
} = createImportJobQueue<MsMoneyImportJobData, MsMoneyImportSummary, MsMoneyImportProgress>({
  baseName: 'ms-money-import',
  sseEventType: SSE_EVENT_TYPES.MS_MONEY_IMPORT_PROGRESS,
  logLabel: 'MS Money Import',
  processJob: async ({ job, onProgress }) => {
    const { userId, uploadId, accountMapping, categoryMapping, skipDuplicateIndices, recalculateBalance } = job.data;
    return executeMsMoneyImport({
      userId,
      uploadId,
      accountMapping,
      categoryMapping,
      skipDuplicateIndices,
      recalculateBalance,
      onProgress,
    });
  },
});

export { msMoneyImportQueue, msMoneyImportWorker };

/** Public entry point — controller calls this to enqueue an import. */
export async function queueMsMoneyImport({
  userId,
  uploadId,
  accountMapping,
  categoryMapping,
  skipDuplicateIndices,
  recalculateBalance,
}: {
  userId: number;
  uploadId: string;
  accountMapping: MsMoneyAccountMapping;
  categoryMapping: CategoryMappingConfig;
  skipDuplicateIndices: number[];
  recalculateBalance?: boolean;
}): Promise<string> {
  // Check the upload before queuing anything: an id that is unknown, expired, or
  // somebody else's is a 404 the user can act on, not a job that starts and then
  // dies with the same message minutes later.
  await assertMsMoneyUploadExists({ userId, uploadId });

  // Hyphens only — a colon in a custom jobId makes BullMQ throw. Random suffix
  // (not a timestamp): two imports the same user fires within the same
  // millisecond would otherwise collide on one id, and BullMQ silently drops the
  // second `add` for a duplicate jobId — losing that import with no error.
  const jobId = `ms-money-import-${userId}-${randomUUID()}`;
  const data: MsMoneyImportJobData = {
    userId,
    uploadId,
    accountMapping,
    categoryMapping,
    skipDuplicateIndices,
    recalculateBalance,
  };

  await enqueue({ userId, jobId, data });

  return jobId;
}

/** Fallback polling path: returns the current state of a job for a given user. */
export async function getMsMoneyImportProgress({
  userId,
  jobId,
}: {
  userId: number;
  jobId: string;
}): Promise<MsMoneyImportProgress | null> {
  return getImportProgress({ userId, jobId });
}
