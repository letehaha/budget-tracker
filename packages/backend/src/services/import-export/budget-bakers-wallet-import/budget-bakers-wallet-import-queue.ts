import {
  type BudgetBakersWalletAccountMapping,
  type BudgetBakersWalletImportProgress,
  type BudgetBakersWalletImportSummary,
  type CategoryMappingConfig,
  SSE_EVENT_TYPES,
} from '@bt/shared/types';
import { SentryTraceData } from '@js/utils/sentry';
import { createImportJobQueue } from '@services/import-export/core/queue/create-import-job-queue';
import { randomUUID } from 'node:crypto';

import { executeBudgetBakersWalletImport } from './execute-import.service';

interface BudgetBakersWalletImportJobData extends SentryTraceData {
  userId: number;
  fileContent: string;
  accountMapping: BudgetBakersWalletAccountMapping;
  categoryMapping: CategoryMappingConfig;
  skipDuplicateIndices: number[];
  /** When true, rows dated on/after a linked account's pre-import boundary move
   *  its current balance; when false/absent the pre-import balance is preserved. */
  recalculateBalance?: boolean;
}

const {
  queue: budgetBakersWalletImportQueue,
  worker: budgetBakersWalletImportWorker,
  enqueue,
  getImportProgress,
} = createImportJobQueue<
  BudgetBakersWalletImportJobData,
  BudgetBakersWalletImportSummary,
  BudgetBakersWalletImportProgress
>({
  baseName: 'budget-bakers-wallet-import',
  sseEventType: SSE_EVENT_TYPES.BUDGET_BAKERS_WALLET_IMPORT_PROGRESS,
  logLabel: 'Budget Bakers Wallet Import',
  processJob: async ({ job, onProgress }) => {
    const { userId, fileContent, accountMapping, categoryMapping, skipDuplicateIndices, recalculateBalance } = job.data;
    return executeBudgetBakersWalletImport({
      userId,
      fileContent,
      accountMapping,
      categoryMapping,
      skipDuplicateIndices,
      recalculateBalance,
      onProgress,
    });
  },
});

export { budgetBakersWalletImportQueue, budgetBakersWalletImportWorker };

/** Public entry point — controller calls this to enqueue an import. */
export async function queueBudgetBakersWalletImport({
  userId,
  fileContent,
  accountMapping,
  categoryMapping,
  skipDuplicateIndices,
  recalculateBalance,
}: {
  userId: number;
  fileContent: string;
  accountMapping: BudgetBakersWalletAccountMapping;
  categoryMapping: CategoryMappingConfig;
  skipDuplicateIndices: number[];
  recalculateBalance?: boolean;
}): Promise<string> {
  // Random suffix (not a timestamp): two imports the same user fires within the
  // same millisecond would otherwise collide on one id, and BullMQ silently drops
  // the second `add` for a duplicate jobId — losing the second import with no error.
  const jobId = `budget-bakers-wallet-import-${userId}-${randomUUID()}`;
  const data: BudgetBakersWalletImportJobData = {
    userId,
    fileContent,
    accountMapping,
    categoryMapping,
    skipDuplicateIndices,
    recalculateBalance,
  };

  await enqueue({ userId, jobId, data });

  return jobId;
}

/** Fallback polling path: returns the current state of a job for a given user. */
export async function getBudgetBakersWalletImportProgress({
  userId,
  jobId,
}: {
  userId: number;
  jobId: string;
}): Promise<BudgetBakersWalletImportProgress | null> {
  return getImportProgress({ userId, jobId });
}
