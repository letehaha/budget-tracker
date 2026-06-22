import {
  type CategoryMappingConfig,
  SSE_EVENT_TYPES,
  type WalletAccountMapping,
  type WalletImportProgress,
  type WalletImportSummary,
} from '@bt/shared/types';
import { SentryTraceData } from '@js/utils/sentry';
import { createImportJobQueue } from '@services/import-export/create-import-job-queue';
import { randomUUID } from 'node:crypto';

import { executeWalletImport } from './execute-import.service';

interface WalletImportJobData extends SentryTraceData {
  userId: number;
  fileContent: string;
  accountMapping: WalletAccountMapping;
  categoryMapping: CategoryMappingConfig;
  skipDuplicateIndices: number[];
}

const {
  queue: walletImportQueue,
  worker: walletImportWorker,
  enqueue,
  getImportProgress,
} = createImportJobQueue<WalletImportJobData, WalletImportSummary, WalletImportProgress>({
  baseName: 'wallet-import',
  sseEventType: SSE_EVENT_TYPES.WALLET_IMPORT_PROGRESS,
  logLabel: 'Wallet Import',
  processJob: async ({ job, onProgress }) => {
    const { userId, fileContent, accountMapping, categoryMapping, skipDuplicateIndices } = job.data;
    return executeWalletImport({
      userId,
      fileContent,
      accountMapping,
      categoryMapping,
      skipDuplicateIndices,
      onProgress,
    });
  },
  buildRunningPayload: ({ jobId, processedCount, totalCount }) => ({
    jobId,
    status: 'running',
    processedCount,
    totalCount,
  }),
  buildCompletedPayload: ({ jobId, totalCount, summary }) => ({
    jobId,
    status: 'completed',
    processedCount: totalCount,
    totalCount,
    summary,
  }),
  buildFailedPayload: ({ jobId, processedCount, totalCount, error }) => ({
    jobId,
    status: 'failed',
    processedCount,
    totalCount,
    error,
  }),
});

export { walletImportQueue, walletImportWorker };

/** Public entry point — controller calls this to enqueue an import. */
export async function queueWalletImport({
  userId,
  fileContent,
  accountMapping,
  categoryMapping,
  skipDuplicateIndices,
}: {
  userId: number;
  fileContent: string;
  accountMapping: WalletAccountMapping;
  categoryMapping: CategoryMappingConfig;
  skipDuplicateIndices: number[];
}): Promise<string> {
  // Random suffix (not a timestamp): two imports the same user fires within the
  // same millisecond would otherwise collide on one id, and BullMQ silently drops
  // the second `add` for a duplicate jobId — losing the second import with no error.
  const jobId = `wallet-import-${userId}-${randomUUID()}`;
  const data: WalletImportJobData = { userId, fileContent, accountMapping, categoryMapping, skipDuplicateIndices };

  await enqueue({
    userId,
    jobId,
    data,
    queuedPayload: { jobId, status: 'queued', processedCount: 0, totalCount: 0 },
  });

  return jobId;
}

/** Fallback polling path: returns the current state of a job for a given user. */
export async function getWalletImportProgress({
  userId,
  jobId,
}: {
  userId: number;
  jobId: string;
}): Promise<WalletImportProgress | null> {
  return getImportProgress({ userId, jobId });
}
