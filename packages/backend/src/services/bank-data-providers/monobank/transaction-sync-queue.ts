import { Queue, Worker, Job } from 'bullmq';
import { logger } from '@js/utils/logger';
import { MonobankApiClient } from './api-client';
import { ExternalMonobankTransactionResponse } from '@bt/shared/types/external-services';
import {
  ACCOUNT_TYPES,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import * as transactionsService from '@services/transactions';
import * as MerchantCategoryCodes from '@models/MerchantCategoryCodes.model';
import * as UserMerchantCategoryCodes from '@models/UserMerchantCategoryCodes.model';
import * as Users from '@models/Users.model';
import Accounts from '@models/Accounts.model';

interface TransactionSyncJobData {
  userId: number;
  accountId: number;
  connectionId: number;
  externalAccountId: string;
  apiToken: string;
  fromTimestamp: number;
  toTimestamp: number;
  batchIndex: number;
  totalBatches: number;
}

// Redis connection configuration for BullMQ
const connection = {
  host: process.env.APPLICATION_REDIS_HOST,
  maxRetriesPerRequest: null, // Required for BullMQ
};

// Create queue for transaction sync jobs
export const transactionSyncQueue = new Queue<TransactionSyncJobData>('monobank-transaction-sync', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000, // Start with 60 seconds due to Monobank rate limits
    },
    removeOnComplete: {
      age: 7200, // Keep completed jobs for 2 hours (enough time for UI to poll)
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
});

/**
 * Create transaction from Monobank API response
 */
async function createMonobankTransaction(
  data: ExternalMonobankTransactionResponse,
  accountId: number,
  userId: number,
): Promise<void> {
  // Check if transaction already exists (duplicate prevention)
  const isTransactionExists = await transactionsService.getTransactionBySomeId({
    originalId: data.id,
    userId,
  });

  if (isTransactionExists) {
    logger.info(`Transaction ${data.id} already exists, skipping`);
    return;
  }

  // Get or create MCC code
  let mccRecord = await MerchantCategoryCodes.getByCode({ code: data.mcc });

  if (!mccRecord) {
    mccRecord = await MerchantCategoryCodes.addCode({ code: data.mcc });
  }

  // Get or create user MCC mapping to category
  const userMcc = await UserMerchantCategoryCodes.getByPassedParams({
    mccId: mccRecord.get('id'),
    userId,
  });

  let categoryId: number;

  if (userMcc.length) {
    categoryId = userMcc[0]!.get('categoryId');
  } else {
    // Use default category for this user
    const defaultCategory = await Users.getUserDefaultCategory({ id: userId });
    categoryId = defaultCategory!.get('defaultCategoryId');

    // Create mapping for future transactions
    await UserMerchantCategoryCodes.createEntry({
      mccId: mccRecord.get('id'),
      userId,
      categoryId,
    });
  }

  // Create transaction in database
  await transactionsService.createTransaction({
    originalId: data.id,
    note: data.description,
    amount: Math.abs(data.amount),
    time: new Date(data.time * 1000),
    externalData: {
      operationAmount: data.operationAmount,
      receiptId: data.receiptId,
      balance: data.balance,
      hold: data.hold,
    },
    commissionRate: data.commissionRate,
    cashbackAmount: data.cashbackAmount,
    accountId,
    userId,
    transactionType: data.amount > 0 ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
    paymentType: PAYMENT_TYPES.creditCard,
    categoryId,
    transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    accountType: ACCOUNT_TYPES.monobank,
  });

  logger.info(`Created Monobank transaction: ${data.id}, amount: ${data.amount}`);
}

// Create worker to process transaction sync jobs
export const transactionSyncWorker = new Worker<TransactionSyncJobData>(
  'monobank-transaction-sync',
  async (job: Job<TransactionSyncJobData>) => {
    const { userId, accountId, externalAccountId, apiToken, fromTimestamp, toTimestamp, batchIndex, totalBatches } =
      job.data;

    logger.info(
      `Processing Monobank transaction sync batch ${batchIndex + 1}/${totalBatches} for account ${accountId}`,
    );

    // Update job progress
    await job.updateProgress({
      batchIndex,
      totalBatches,
      status: 'fetching',
    });

    try {
      const apiClient = new MonobankApiClient(apiToken);

      // Fetch transactions from Monobank API
      const transactions = await apiClient.getStatement(externalAccountId, fromTimestamp, toTimestamp);

      logger.info(`Fetched ${transactions.length} transactions for batch ${batchIndex + 1}/${totalBatches}`);

      // Update job progress
      await job.updateProgress({
        batchIndex,
        totalBatches,
        status: 'processing',
        transactionCount: transactions.length,
      });

      // Process each transaction
      for (let i = 0; i < transactions.length; i++) {
        await createMonobankTransaction(transactions[i]!, accountId, userId);

        // Update progress periodically
        if (i % 10 === 0) {
          await job.updateProgress({
            batchIndex,
            totalBatches,
            status: 'processing',
            transactionCount: transactions.length,
            processedCount: i + 1,
          });
        }
      }

      // Update account's last synced timestamp in externalData
      const account = await Accounts.findByPk(accountId);
      if (account) {
        const externalData = (account.externalData as Record<string, unknown>) || {};
        externalData.lastSyncedAt = new Date().toISOString();
        account.externalData = externalData;
        await account.save();
      }

      logger.info(`Completed batch ${batchIndex + 1}/${totalBatches} for account ${accountId}`);

      return {
        success: true,
        batchIndex,
        totalBatches,
        transactionCount: transactions.length,
      };
    } catch (error) {
      logger.error({ message: `Error processing batch ${batchIndex + 1}/${totalBatches}`, error: error as Error });
      throw error; // Will trigger retry
    }
  },
  {
    connection,
    concurrency: 1, // Process one job at a time per worker
    limiter: {
      max: 1, // Max jobs per duration
      duration: 60000, // 60 seconds - Monobank rate limit
    },
  },
);

// Worker event listeners
transactionSyncWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

transactionSyncWorker.on('failed', (job, err) => {
  logger.error({ message: `Job ${job?.id} failed`, error: err });
});

transactionSyncWorker.on('error', (err) => {
  logger.error({ message: 'Worker error', error: err });
});

/**
 * Split date range into 31-day chunks (Monobank API limitation)
 * Returns chunks in DESCENDING order (newest first) for better UX
 */
export function splitDateRangeIntoChunks(from: Date, to: Date): Array<{ from: Date; to: Date }> {
  const chunks: Array<{ from: Date; to: Date }> = [];
  const MAX_DAYS = 31;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  let currentFrom = new Date(from);
  const endDate = new Date(to);

  while (currentFrom < endDate) {
    const currentTo = new Date(Math.min(currentFrom.getTime() + MAX_DAYS * MS_PER_DAY, endDate.getTime()));

    chunks.push({
      from: new Date(currentFrom),
      to: new Date(currentTo),
    });

    currentFrom = new Date(currentTo.getTime() + 1); // Move to next day
  }

  // Reverse to process newest transactions first
  return chunks.reverse();
}

/**
 * Queue transaction sync job for a date range
 * Automatically splits into 31-day chunks
 */
export async function queueTransactionSync(params: {
  userId: number;
  accountId: number;
  connectionId: number;
  externalAccountId: string;
  apiToken: string;
  from: Date;
  to: Date;
}): Promise<{ jobGroupId: string; totalBatches: number; estimatedMinutes: number }> {
  const { userId, accountId, connectionId, externalAccountId, apiToken, from, to } = params;

  // Split date range into chunks
  const chunks = splitDateRangeIntoChunks(from, to);

  // Generate unique group ID for this sync operation
  const jobGroupId = `${userId}-${accountId}-${Date.now()}`;

  // Queue jobs for each chunk
  const jobs = chunks.map((chunk, index) => ({
    name: `sync-${jobGroupId}-${index}`,
    data: {
      userId,
      accountId,
      connectionId,
      externalAccountId,
      apiToken,
      fromTimestamp: Math.floor(chunk.from.getTime() / 1000),
      toTimestamp: Math.floor(chunk.to.getTime() / 1000),
      batchIndex: index,
      totalBatches: chunks.length,
    },
    opts: {
      jobId: `${jobGroupId}-${index}`,
    },
  }));

  await transactionSyncQueue.addBulk(jobs);

  logger.info(`Queued ${chunks.length} batch(es) for transaction sync (group: ${jobGroupId})`);

  // Each batch takes ~60 seconds due to rate limiting
  const estimatedMinutes = Math.max(1, chunks.length - 1); // First batch starts immediately

  return {
    jobGroupId,
    totalBatches: chunks.length,
    estimatedMinutes,
  };
}

/**
 * Get job progress for a group of jobs
 */
export async function getJobGroupProgress(jobGroupId: string): Promise<{
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  activeBatches: number;
  waitingBatches: number;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'partial';
  progress?: unknown;
}> {
  // Fetch jobs by state separately to avoid duplicates
  const [waitingJobs, activeJobs, completedJobs, failedJobs] = await Promise.all([
    transactionSyncQueue.getJobs(['waiting']),
    transactionSyncQueue.getJobs(['active']),
    transactionSyncQueue.getJobs(['completed']),
    transactionSyncQueue.getJobs(['failed']),
  ]);

  // Filter jobs belonging to this group for each state
  const waitingGroupJobs = waitingJobs.filter((job) => job.id?.startsWith(jobGroupId));
  const activeGroupJobs = activeJobs.filter((job) => job.id?.startsWith(jobGroupId));
  const completedGroupJobs = completedJobs.filter((job) => job.id?.startsWith(jobGroupId));
  const failedGroupJobs = failedJobs.filter((job) => job.id?.startsWith(jobGroupId));

  const waitingBatches = waitingGroupJobs.length;
  const activeBatches = activeGroupJobs.length;
  const completedBatches = completedGroupJobs.length;
  const failedBatches = failedGroupJobs.length;
  const totalBatches = waitingBatches + activeBatches + completedBatches + failedBatches;

  if (totalBatches === 0) {
    return {
      totalBatches: 0,
      completedBatches: 0,
      failedBatches: 0,
      activeBatches: 0,
      waitingBatches: 0,
      status: 'completed', // Assume completed if no jobs found (cleaned up)
    };
  }

  logger.info(
    `Job group ${jobGroupId} progress: ${completedBatches}/${totalBatches} completed, ${activeBatches} active, ${waitingBatches} waiting, ${failedBatches} failed`,
  );

  // Get progress from active job if any
  const activeJob = activeGroupJobs[0];
  const progress = activeJob?.progress;

  // Determine overall status
  let status: 'waiting' | 'active' | 'completed' | 'failed' | 'partial';
  if (completedBatches === totalBatches) {
    status = 'completed';
  } else if (failedBatches > 0 && completedBatches + failedBatches === totalBatches) {
    status = 'failed';
  } else if (activeBatches > 0) {
    status = 'active';
  } else if (waitingBatches > 0) {
    status = 'waiting';
  } else {
    status = 'partial';
  }

  return {
    totalBatches,
    completedBatches,
    failedBatches,
    activeBatches,
    waitingBatches,
    status,
    progress,
  };
}

/**
 * Get all active job groups for a specific user
 * Returns list of jobGroupIds that are still in progress
 */
export async function getActiveJobsForUser(userId: number): Promise<
  Array<{
    jobGroupId: string;
    connectionId: number;
    accountId: number;
    status: 'waiting' | 'active';
  }>
> {
  const jobs = await transactionSyncQueue.getJobs(['waiting', 'active']);

  // Group jobs by jobGroupId
  const jobGroups = new Map<string, Array<{ accountId: number }>>();

  jobs.forEach((job) => {
    const jobId = job.id;
    if (!jobId) return;

    // Extract jobGroupId (everything before the last dash)
    const lastDashIndex = jobId.lastIndexOf('-');
    if (lastDashIndex === -1) return;

    const jobGroupId = jobId.substring(0, lastDashIndex);

    // Check if this job belongs to the user (jobGroupId format: userId-accountId-timestamp)
    const userIdFromJob = parseInt(jobGroupId.split('-')[0] || '');
    if (userIdFromJob !== userId) return;

    // Extract accountId from job data
    const { accountId } = job.data;

    // Extract connectionId from jobGroupId (format: userId-accountId-timestamp)
    // We'll get it from the first job's data when we process the group

    if (!jobGroups.has(jobGroupId)) {
      jobGroups.set(jobGroupId, []);
    }
    jobGroups.get(jobGroupId)!.push({ accountId });
  });

  // Convert to array with status
  const result: Array<{
    jobGroupId: string;
    connectionId: number;
    accountId: number;
    status: 'waiting' | 'active';
  }> = [];

  for (const [jobGroupId, jobData] of jobGroups.entries()) {
    if (jobData.length > 0) {
      // Get status of the group and connectionId from first job
      const groupJobs = jobs.filter((job) => job.id?.startsWith(jobGroupId));
      const firstJob = groupJobs[0];
      if (!firstJob) continue;

      const hasActive = groupJobs.some((job) => job.isActive());
      const status = hasActive ? 'active' : 'waiting';

      // Get connectionId from the job data
      const connectionId = firstJob.data.connectionId;

      result.push({
        jobGroupId,
        connectionId,
        accountId: jobData[0]!.accountId,
        status,
      });
    }
  }

  return result;
}
