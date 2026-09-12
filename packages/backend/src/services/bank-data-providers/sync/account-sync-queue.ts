import { BANK_PROVIDER_TYPE, type RecordId } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { SentryTraceData, withQueueProcessSpan, withQueuePublishSpan } from '@js/utils/sentry';
import { Job, Queue, Worker } from 'bullmq';

import { syncTransactionsForAccount } from '../connection/sync-transactions-for-account';
import { bankProviderRegistry } from '../registry';
import { SyncStatus, setAccountSyncStatus } from './sync-status-tracker';

interface AccountSyncJobData extends SentryTraceData {
  userId: number;
  connectionId: RecordId;
  providerType: BANK_PROVIDER_TYPE;
  accountIds: RecordId[];
}

// Mirrors the resilient settings of the main redisClient. BullMQ requires
// `maxRetriesPerRequest: null`.
const connectionOptions = {
  host: process.env.APPLICATION_REDIS_HOST,
  maxRetriesPerRequest: null,
  connectTimeout: 20000,
  keepAlive: 10000,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
};

// Namespace by Jest worker ID so parallel test workers don't share a queue.
const queueName =
  process.env.NODE_ENV === 'test' && process.env.JEST_WORKER_ID
    ? `account-sync-${process.env.JEST_WORKER_ID}`
    : 'account-sync';

/**
 * Transaction sync for a connection's bank accounts, off the request path.
 * Both the initial sync after linking accounts and the user-triggered "sync all"
 * go through here, so a restart mid-sync resumes the work from Redis.
 */
export const accountSyncQueue = new Queue<AccountSyncJobData>(queueName, {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 1,
    // Job ids are deterministic, so a finished job must not linger: it would
    // make the next sync for the same account look like a duplicate.
    removeOnComplete: true,
    removeOnFail: true,
  },
});

accountSyncQueue.on('error', (err) => {
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[Account Sync Queue] Queue error', error: err });
  }
});

const markAccountsFailed = ({ accountIds, error, userId }: { accountIds: RecordId[]; error: Error; userId: number }) =>
  Promise.all(
    accountIds.map((accountId) =>
      setAccountSyncStatus({ accountId, status: SyncStatus.FAILED, error: error.message, userId }),
    ),
  );

async function processAccountSync({
  userId,
  connectionId,
  providerType,
  accountIds,
}: AccountSyncJobData): Promise<void> {
  try {
    const provider = bankProviderRegistry.get(providerType);

    if (typeof provider.syncConnectionAccounts === 'function') {
      // Batch-capable provider (e.g. SimpleFIN): one windowed fetch per connection
      // covering every account, instead of a per-account fan-out.
      await provider.syncConnectionAccounts({ connectionId, userId, systemAccountIds: accountIds });
      return;
    }

    const [accountId] = accountIds;
    await syncTransactionsForAccount({ connectionId, userId, accountId: accountId! });
  } catch (error) {
    logger.error({
      message: `[Account Sync Worker] Transaction sync failed for accounts ${accountIds.join(', ')}`,
      error: error as Error,
    });
    try {
      await markAccountsFailed({ accountIds, error: error as Error, userId });
    } catch (statusError) {
      logger.error({
        message: '[Account Sync Worker] Failed to record FAILED sync status',
        error: statusError as Error,
      });
    }
    throw error;
  }
}

export const accountSyncWorker = new Worker<AccountSyncJobData>(
  queueName,
  (job: Job<AccountSyncJobData>) => withQueueProcessSpan({ queueName, job, fn: () => processAccountSync(job.data) }),
  {
    connection: connectionOptions,
    concurrency: 5,
    maxStalledCount: 2,
  },
);

accountSyncWorker.on('failed', async (job, err) => {
  logger.error({ message: `[Account Sync Worker] Job ${job?.id} failed`, error: err });

  if (!job) return;

  // Catch-all for jobs that never reached the processor's own handler — a
  // stalled job leaves its accounts SYNCING forever otherwise.
  try {
    await markAccountsFailed({ accountIds: job.data.accountIds, error: err, userId: job.data.userId });
  } catch (statusError) {
    logger.error({ message: '[Account Sync Worker] Failed to record FAILED sync status', error: statusError as Error });
  }
});

accountSyncWorker.on('error', (err) => {
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[Account Sync Worker] Worker error', error: err });
  }
});

const addSyncJob = async ({
  userId,
  connectionId,
  providerType,
  accountIds,
  jobId,
}: {
  userId: number;
  connectionId: RecordId;
  providerType: BANK_PROVIDER_TYPE;
  accountIds: RecordId[];
  jobId: string;
}): Promise<void> => {
  const data: AccountSyncJobData = { userId, connectionId, providerType, accountIds };

  await withQueuePublishSpan({
    queueName,
    messageId: jobId,
    payloadSize: JSON.stringify(data).length,
    fn: async (traceData) => {
      await accountSyncQueue.add('sync-accounts', { ...data, ...traceData }, { jobId });
    },
  });
};

/**
 * Queue a transaction sync for one connection's accounts.
 *
 * Batch-capable providers (SimpleFIN) get one job for the whole connection so
 * the sync stays within their request budget; every other provider gets one job
 * per account so the worker's concurrency applies across accounts.
 *
 * Accounts are marked QUEUED before their job is added, so a status poll issued
 * right after the HTTP response already sees the sync as in progress.
 */
export async function enqueueAccountSync({
  userId,
  connectionId,
  providerType,
  accountIds,
}: {
  userId: number;
  connectionId: RecordId;
  providerType: BANK_PROVIDER_TYPE;
  accountIds: RecordId[];
}): Promise<void> {
  if (accountIds.length === 0) return;

  const provider = bankProviderRegistry.get(providerType);
  const jobs =
    typeof provider.syncConnectionAccounts === 'function'
      ? [{ jobId: `account-sync-${connectionId}`, accountIds }]
      : accountIds.map((accountId) => ({ jobId: `account-sync-${accountId}`, accountIds: [accountId] }));

  for (const job of jobs) {
    // Finished jobs are removed, so an existing job is one that is still
    // waiting, active or delayed: this sync is already in flight.
    const existing = await accountSyncQueue.getJob(job.jobId);
    if (existing) continue;

    await Promise.all(
      job.accountIds.map((accountId) => setAccountSyncStatus({ accountId, status: SyncStatus.QUEUED, userId })),
    );

    try {
      await addSyncJob({ userId, connectionId, providerType, accountIds: job.accountIds, jobId: job.jobId });
    } catch (error) {
      await markAccountsFailed({ accountIds: job.accountIds, error: error as Error, userId });
      throw error;
    }
  }
}

/** Account syncs write transactions; an unfinished job for this user could still
 *  commit rows computed against the old base currency. */
export async function countUnfinishedAccountSyncJobsForUser({ userId }: { userId: number }): Promise<number> {
  const jobs = await accountSyncQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized', 'paused']);
  return jobs.filter((job) => job.data.userId === userId).length;
}
