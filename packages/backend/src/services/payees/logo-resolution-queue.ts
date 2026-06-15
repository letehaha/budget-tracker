import { logger } from '@js/utils/logger';
import { namespace } from '@models/connection';
import { Job, Queue, Worker } from 'bullmq';
import type { Transaction } from 'sequelize';

import { resolveLogoForPayee } from './resolve-logo.service';

interface LogoResolutionJobData {
  payeeId: string;
}

// Redis connection configuration for BullMQ. Mirrors the resilient settings of
// the main redisClient / ai-categorization queue to prevent "Connection is
// closed" errors in CI. BullMQ requires `maxRetriesPerRequest: null`.
const connection = {
  host: process.env.APPLICATION_REDIS_HOST,
  maxRetriesPerRequest: null,
  connectTimeout: 20000, // 20s connection timeout for slower CI environments
  keepAlive: 10000, // Send TCP keepalive to prevent idle disconnection
  retryStrategy: (times: number) => Math.min(times * 100, 3000), // Exponential backoff, max 3s
};

// Namespace queue by Jest worker ID in test environment so parallel workers
// don't share a queue.
const queueName =
  process.env.NODE_ENV === 'test' && process.env.JEST_WORKER_ID
    ? `payee-logo-resolution-${process.env.JEST_WORKER_ID}`
    : 'payee-logo-resolution';

/**
 * Queue for per-Payee brand-logo resolution jobs.
 */
export const logoResolutionQueue = new Queue<LogoResolutionJobData>(queueName, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000, // 1min, 2min, 4min
    },
    removeOnComplete: true,
    removeOnFail: {
      age: 3600, // Keep failed jobs for 1 hour for debugging
    },
  },
});

// Handle Queue error events to prevent unhandled exceptions in CI.
logoResolutionQueue.on('error', (err) => {
  // Ignore "Connection is closed" errors during test teardown.
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[Payee Logo Queue] Queue error', error: err });
  }
});

/**
 * Worker that resolves one Payee's logo per job. Concurrency plus a rate
 * limiter bound the logo.dev request rate across all in-flight jobs.
 * Exported for proper cleanup in test teardown.
 */
export const logoResolutionWorker = new Worker<LogoResolutionJobData>(
  queueName,
  async (job: Job<LogoResolutionJobData>) => {
    const { payeeId } = job.data;
    // Pass `transaction: null` so the resolver's queries opt out of Sequelize's
    // cls-hooked transaction injection. The worker shares its process with the
    // HTTP server; cls-hooked can bleed a concurrent request's already-committed
    // transaction into this async chain, and an inherited committed transaction
    // makes `payee.update()` throw "commit has been called on this transaction".
    // Sequelize only consults the ambient CLS transaction when `options.transaction`
    // is `undefined`, so an explicit `null` bypasses it — more reliable than
    // clearing the ambient value, which cls-hooked can't guarantee across native
    // promise continuations.
    await resolveLogoForPayee({ payeeId, transaction: null });
  },
  {
    connection,
    concurrency: 5,
    // Bound logo.dev QPS regardless of concurrency / pending backlog.
    limiter: {
      max: 10,
      duration: 1000,
    },
  },
);

logoResolutionWorker.on('failed', (job, err) => {
  logger.error({ message: `[Payee Logo Worker] Job ${job?.id} failed`, error: err });
});

logoResolutionWorker.on('error', (err) => {
  // Ignore "Connection is closed" errors during test teardown.
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[Payee Logo Worker] Worker error', error: err });
  }
});

/**
 * Enqueue logo resolution for a single Payee. The `payee-logo-<payeeId>` jobId
 * dedups re-enqueues of the same Payee (e.g. lazy-on-read backfill firing on
 * every list request) down to one in-flight job. BullMQ forbids `:` in a custom
 * job id, so the separator is `-`.
 *
 * Safe to call when Redis / the queue is unavailable: a failed enqueue is
 * logged and swallowed so it can never break Payee creation or a read path.
 */
export async function enqueueLogoResolution({ payeeId }: { payeeId: string }): Promise<void> {
  try {
    await logoResolutionQueue.add('resolve-logo', { payeeId }, { jobId: `payee-logo-${payeeId}` });
  } catch (error) {
    logger.warn(`[Payee Logo Queue] Failed to enqueue logo resolution for payee ${payeeId}: ${String(error)}`);
  }
}

/**
 * Enqueue logo resolution only after the surrounding DB transaction commits.
 *
 * A Payee created inside a transaction isn't visible to the worker (a separate
 * connection) until commit, and the row vanishes entirely on rollback — so
 * enqueuing before commit risks the worker reading a not-yet-visible or
 * rolled-back row. The active transaction is read from the Sequelize CLS
 * namespace (`withTransaction` runs queries inside it). When one is in scope we
 * defer via `afterCommit`; otherwise (no ambient transaction) we enqueue
 * directly.
 */
export function enqueueLogoResolutionAfterCommit({ payeeId }: { payeeId: string }): void {
  // `finished` ('commit' | 'rollback') isn't on the public Transaction type, but
  // `withTransaction` checks it the same way to detect stale CLS transactions.
  const transaction = namespace.get('transaction') as (Transaction & { finished?: string }) | undefined;
  if (transaction && !transaction.finished) {
    transaction.afterCommit(() => enqueueLogoResolution({ payeeId }));
  } else {
    void enqueueLogoResolution({ payeeId });
  }
}
