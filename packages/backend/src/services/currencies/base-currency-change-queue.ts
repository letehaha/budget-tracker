import {
  API_ERROR_CODES,
  type BaseCurrencyChangeStatus,
  type RecalculateResult,
  SSE_EVENT_TYPES,
} from '@bt/shared/types';
import { t } from '@i18n/index';
import { LockedError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { redisClient } from '@root/redis-client';
import { sseManager } from '@services/common/sse';
import { Job, Queue, Worker } from 'bullmq';
import { randomUUID } from 'crypto';

import { drainUserWriters } from './base-currency-change-drain';
import {
  acquireBaseCurrencyLock,
  extendBaseCurrencyLockTtlIfOwned,
  releaseBaseCurrencyLockIfOwned,
} from './base-currency-lock';
import { changeBaseCurrencyImpl, validateBaseCurrencyChange } from './change-base-currency.service';

interface BaseCurrencyChangeJobData {
  userId: number;
  newCurrencyCode: string;
}

// Redis connection for BullMQ. Mirrors the resilient settings the other queues
// use to avoid "Connection is closed." errors in CI. BullMQ requires
// `maxRetriesPerRequest: null`.
const connection = {
  host: process.env.APPLICATION_REDIS_HOST,
  maxRetriesPerRequest: null,
  connectTimeout: 20000,
  keepAlive: 10000,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
};

// Namespace the queue by Jest worker id in tests so parallel workers don't share
// a queue. No shared helper exists for this, so it's inline like the sibling queues.
const queueName =
  process.env.NODE_ENV === 'test' && process.env.JEST_WORKER_ID
    ? `base-currency-change-${process.env.JEST_WORKER_ID}`
    : 'base-currency-change';

const CONNECTION_CLOSED_ERROR_MSG = 'Connection is closed.';

function isConnectionClosedError(err: Error): boolean {
  return err.message === CONNECTION_CLOSED_ERROR_MSG;
}

/**
 * Per-user pointer to the most recent change-base job. The status endpoint reads
 * the jobId from here — there are no URL params. `-` separators keep it consistent
 * with the jobId (BullMQ forbids `:` in custom job ids). The main `redisClient`
 * namespaces it per Jest worker via `REDIS_KEY_PREFIX`.
 */
export const buildLastJobPointerKey = (userId: number): string => `base-currency-change-last-job-${userId}`;

// Heartbeat cadence for extending the lock TTL while a long recalc runs, so the
// lock never lapses mid-rewrite and reopens the guarded routes.
const LOCK_HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;

export const baseCurrencyChangeQueue = new Queue<BaseCurrencyChangeJobData, RecalculateResult>(queueName, {
  connection,
  defaultJobOptions: {
    attempts: 1, // One user-triggered recalc; never auto-retry a partial-looking failure.
    removeOnComplete: { age: 24 * 3600 }, // Keep a day so /status can still report the result.
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

baseCurrencyChangeQueue.on('error', (err) => {
  if (!isConnectionClosedError(err)) {
    logger.error({ message: '[Base Currency Change Queue] Queue error', error: err });
  }
});

function emitStatus({ userId, status }: { userId: number; status: BaseCurrencyChangeStatus }): void {
  sseManager.sendToUser({ userId, event: SSE_EVENT_TYPES.BASE_CURRENCY_CHANGE_STATUS, data: status });
}

export const baseCurrencyChangeWorker = new Worker<BaseCurrencyChangeJobData, RecalculateResult>(
  queueName,
  async (job: Job<BaseCurrencyChangeJobData>) => {
    const { userId, newCurrencyCode } = job.data;
    const jobId = job.id!;

    // Keep the lock alive for the whole recalc: a run past the TTL would otherwise
    // let the lock expire and every guarded route stop 423ing while rows still change.
    const heartbeat = setInterval(() => {
      extendBaseCurrencyLockTtlIfOwned({ userId, jobId }).catch((err) => {
        logger.error({
          message: `[Base Currency Change Worker] Lock TTL heartbeat failed for job ${jobId}`,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    }, LOCK_HEARTBEAT_INTERVAL_MS);

    try {
      emitStatus({ userId, status: { state: 'running', jobId, startedAt: job.processedOn ?? Date.now() } });

      // Wait for in-flight writers to finish (or abort) before the recalc snapshots
      // rows, then re-validate and rewrite every ref* amount. The lock is already
      // held (taken at enqueue); this worker never acquires one.
      await drainUserWriters({ userId });

      return await changeBaseCurrencyImpl({
        userId,
        newCurrencyCode,
        onProgress: async ({ step }) => {
          // Best-effort: a committed step must not roll back because persisting
          // progress or the SSE push threw. The 8 steps are naturally spaced (each
          // sweeps a table), so every step emits — no throttle needed.
          try {
            await job.updateProgress({ step });
            emitStatus({ userId, status: { state: 'running', jobId, step, startedAt: job.processedOn ?? Date.now() } });
          } catch (err) {
            logger.error({
              message: `[Base Currency Change Worker] Progress update failed for job ${jobId}`,
              error: err instanceof Error ? err : new Error(String(err)),
            });
          }
        },
      });
    } finally {
      clearInterval(heartbeat);
      // A crashed worker skips this; the status endpoint's reconciliation is the
      // backstop that releases an orphaned lock.
      await releaseBaseCurrencyLockIfOwned({ userId, jobId }).catch((err) => {
        logger.error({
          message: `[Base Currency Change Worker] Lock release failed for job ${jobId}`,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    }
  },
  {
    connection,
    concurrency: 1,
  },
);

baseCurrencyChangeWorker.on('completed', (job, result) => {
  emitStatus({
    userId: job.data.userId,
    status: { state: 'completed', jobId: job.id!, finishedAt: job.finishedOn ?? Date.now(), result },
  });
});

baseCurrencyChangeWorker.on('failed', (job, err) => {
  logger.error({ message: `[Base Currency Change Worker] Job ${job?.id} failed`, error: err });
  if (!job) return;
  emitStatus({
    userId: job.data.userId,
    status: { state: 'failed', jobId: job.id!, finishedAt: job.finishedOn ?? undefined, error: err.message },
  });
});

baseCurrencyChangeWorker.on('error', (err) => {
  if (!isConnectionClosedError(err)) {
    logger.error({ message: '[Base Currency Change Worker] Worker error', error: err });
  }
});

/**
 * Validate, take the lock at enqueue time, and queue the recalculation.
 *
 * Order is load-bearing: validate BEFORE the lock so a trivial rejection never
 * holds the 4h lock; take the lock BEFORE queueing so the guard middleware starts
 * returning 423 the instant this resolves (closing the enqueue→pickup window). The
 * NX lock is the dedupe — a second call for the same user 423s here rather than
 * queueing a duplicate. On a failed `queue.add`, the lock and pointer are rolled back.
 */
export async function enqueueBaseCurrencyChange({
  userId,
  newCurrencyCode,
}: BaseCurrencyChangeJobData): Promise<{ jobId: string; state: 'queued' }> {
  await validateBaseCurrencyChange({ userId, newCurrencyCode });

  // Non-deterministic id: a deterministic one would be silently dropped by
  // `queue.add` while a same-id completed job is still retained (24h).
  const jobId = `base-currency-change-${userId}-${randomUUID()}`;

  const acquired = await acquireBaseCurrencyLock({ userId, jobId });
  if (!acquired) {
    // A change is already in flight — surface it (and the current status) so the
    // requesting device flips its blocking overlay on. Imported dynamically: the
    // status service imports this queue, so a static import would be a module cycle.
    const { getBaseCurrencyChangeStatus } = await import('./base-currency-change-status.service');

    // A failed status read (Redis/BullMQ hiccup) must still yield the 423, not a 500.
    // The FE seeds the overlay from its own placeholder when the status seed is absent.
    let status: BaseCurrencyChangeStatus | undefined;
    try {
      status = await getBaseCurrencyChangeStatus({ userId });
    } catch (statusError) {
      logger.warn(`[Base Currency Change] Status read failed while rejecting duplicate enqueue for user ${userId}`, {
        error: statusError instanceof Error ? statusError : new Error(String(statusError)),
      });
    }

    throw new LockedError({
      code: API_ERROR_CODES.baseCurrencyChangeInProgress,
      message: t({ key: 'currencies.baseCurrencyChangeInProgress' }),
      details: status ? { status } : undefined,
    });
  }

  // Pointer write sits inside the rollback try: if it (or the add) throws after
  // the lock SET committed, the lock must be released here — the status service
  // finds jobs via this pointer, so a lock without one is unrecoverable until TTL.
  try {
    await redisClient.set(buildLastJobPointerKey(userId), jobId, 'EX', 24 * 3600);
    await baseCurrencyChangeQueue.add('change-base-currency', { userId, newCurrencyCode }, { jobId });
  } catch (error) {
    // Roll back the lock and pointer, but never mask the original throw. A failed
    // rollback would strand the user behind the full lock TTL, so log it loudly.
    await releaseBaseCurrencyLockIfOwned({ userId, jobId }).catch((rollbackError) => {
      logger.error({
        message: `[Base Currency Change] Lock rollback failed after enqueue error for job ${jobId}`,
        error: rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)),
      });
    });
    await redisClient.del(buildLastJobPointerKey(userId)).catch((rollbackError) => {
      logger.error({
        message: `[Base Currency Change] Pointer rollback failed after enqueue error for job ${jobId}`,
        error: rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)),
      });
    });
    throw error;
  }

  return { jobId, state: 'queued' };
}
