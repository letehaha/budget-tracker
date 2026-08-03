import { CATEGORIZATION_TRIGGER } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { SentryTraceData, withQueueProcessSpan, withQueuePublishSpan } from '@js/utils/sentry';
import { redisClient } from '@root/redis-client';
import { Job, Queue, Worker } from 'bullmq';

import { SSE_EVENT_TYPES, sseManager } from '../common/sse';
import { buildFailedRunStatus } from './categorization-progress';
import { CATEGORIZATION_SCOPE, type CategorizationScope } from './categorization-scope';
import { categorizeTransactions } from './categorization-service';
import { writeTerminalOutcome } from './categorization-terminal-outcome';

interface CategorizationJobData extends SentryTraceData {
  userId: number;
  transactionIds: string[];
  /** Optional: jobs enqueued before this field existed are all auto-path runs. */
  scope?: CategorizationScope;
  /** Optional for jobs enqueued before triggers were recorded; those stamp no trigger. */
  trigger?: CATEGORIZATION_TRIGGER;
}

// Redis connection configuration for BullMQ
// Uses same resilient settings as main redisClient to prevent "Connection is closed" errors in CI
const connection = {
  host: process.env.APPLICATION_REDIS_HOST,
  maxRetriesPerRequest: null, // Required for BullMQ
  connectTimeout: 20000, // 20s connection timeout for slower CI environments
  keepAlive: 10000, // Send TCP keepalive to prevent idle disconnection
  retryStrategy: (times: number) => Math.min(times * 100, 3000), // Exponential backoff, max 3s
};

/** Per-user pointer to the most recent job, so the status endpoint can find it after a page reload. */
export const buildLastCategorizationJobPointerKey = ({ userId }: { userId: number }): string =>
  `ai-categorization-last-job-${userId}`;

// Namespace queue by Jest worker ID in test environment
const queueName =
  process.env.NODE_ENV === 'test' && process.env.JEST_WORKER_ID
    ? `ai-categorization-worker-${process.env.JEST_WORKER_ID}`
    : 'ai-categorization';

/**
 * Queue for AI categorization jobs
 */
export const categorizationQueue = new Queue<CategorizationJobData>(queueName, {
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

// Handle Queue error events to prevent unhandled exceptions in CI
categorizationQueue.on('error', (err) => {
  // Ignore "Connection is closed" errors during test teardown
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[AI Categorization Queue] Queue error', error: err });
  }
});

/**
 * Worker to process categorization jobs
 * Exported for proper cleanup in test teardown
 */
export const categorizationWorker = new Worker<CategorizationJobData>(
  queueName,
  async (job: Job<CategorizationJobData>) => {
    return withQueueProcessSpan({
      queueName,
      job,
      fn: async () => {
        const { userId, transactionIds, trigger } = job.data;
        const scope = job.data.scope ?? CATEGORIZATION_SCOPE.anyCategory;

        logger.info(
          `[AI Categorization Worker] Processing job for user ${userId}, ${transactionIds.length} transactions, attempt ${job.attemptsMade + 1}`,
        );

        const result = await categorizeTransactions({
          userId,
          transactionIds,
          scope,
          trigger,
          totalTransactionCount: transactionIds.length,
          // Mirror batch counters into the job's progress blob for the status endpoint.
          onProgress: (progress) => job.updateProgress(progress),
        });

        if (result.failed.length > 0) {
          logger.info(`[AI Categorization Worker] ${result.failed.length} transactions failed for user ${userId}`);
        }

        return {
          successful: result.successful.length,
          skipped: result.skipped.length,
          failed: result.failed.length,
          // Only the curated `stopReason` may reach a client; `result.errors` can carry raw provider text.
          errorMessage: result.stopReason,
        };
      },
    });
  },
  {
    connection,
    // magic value. No reason to make it less, yet better keep it conservative at this level
    concurrency: 5,
  },
);

// Worker event listeners
categorizationWorker.on('completed', async (job, result) => {
  logger.info(`[AI Categorization Worker] Job ${job.id} completed: ${JSON.stringify(result)}`);

  const { userId, transactionIds } = job.data;

  const terminalPayload = {
    status: 'completed' as const,
    processedCount: result.successful + result.skipped + result.failed,
    totalCount: transactionIds.length,
    failedCount: result.failed,
    skippedCount: result.skipped,
    errorMessage: result.errorMessage,
  };

  // A stopped run still completes, and `removeOnComplete` deletes the job at once,
  // so persist the cause for a page that reloads after it.
  if (result.errorMessage) {
    await writeTerminalOutcome({ userId, outcome: terminalPayload });
  }

  sseManager.sendToUser({
    userId,
    event: SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS,
    data: terminalPayload,
  });
});

categorizationWorker.on('failed', async (job, err) => {
  if (!job) {
    logger.error({ message: '[AI Categorization Worker] Job failed', error: err });
    return;
  }

  // BullMQ fires `failed` per attempt. Until the retry budget is spent the run is
  // only paused (state `delayed`), so a terminal broadcast here would lie.
  const isTerminal = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!isTerminal) {
    logger.info(
      `[AI Categorization Worker] Job ${job.id} attempt ${job.attemptsMade} failed, retrying: ${err.message}`,
    );
    return;
  }

  logger.error({ message: `[AI Categorization Worker] Job ${job.id} failed`, error: err });

  const { userId, transactionIds } = job.data;

  const terminalPayload = buildFailedRunStatus({
    progress: job.progress,
    totalCount: transactionIds.length,
    errorMessage: err.message,
  });

  await writeTerminalOutcome({ userId, outcome: terminalPayload });

  sseManager.sendToUser({
    userId,
    event: SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS,
    data: terminalPayload,
  });
});

categorizationWorker.on('error', (err) => {
  // Ignore "Connection is closed" errors during test teardown
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[AI Categorization Worker] Worker error', error: err });
  }
});

/**
 * Queue transactions for AI categorization. `scope` travels with the job so the worker
 * selects and writes back through the predicate its entry point intended, rather than
 * rebuilding one of its own.
 */
export async function queueCategorizationJob({
  userId,
  transactionIds,
  scope,
  trigger,
}: {
  userId: number;
  transactionIds: string[];
  scope: CategorizationScope;
  trigger: CATEGORIZATION_TRIGGER;
}): Promise<string> {
  if (transactionIds.length === 0) {
    logger.info(`[AI Categorization] No transactions to categorize for user ${userId}`);
    return '';
  }

  const jobId = `categorization-${userId}-${Date.now()}`;
  const data = { userId, transactionIds, scope, trigger };

  await withQueuePublishSpan({
    queueName,
    messageId: jobId,
    payloadSize: JSON.stringify(data).length,
    fn: async (traceData) => {
      await categorizationQueue.add(jobId, { ...data, ...traceData }, { jobId });
    },
  });

  // Best effort: a failed pointer write must not fail the enqueue, live SSE still works.
  // Last writer wins, so overlapping runs for one user leave the newest one pointed at.
  await redisClient
    .set(buildLastCategorizationJobPointerKey({ userId }), jobId, 'EX', 24 * 3600)
    .catch((error: unknown) => {
      logger.error({
        message: `[AI Categorization] Failed to write last-job pointer for user ${userId}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });

  // Send queued event to notify frontend that categorization is scheduled
  sseManager.sendToUser({
    userId,
    event: SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS,
    data: {
      status: 'queued' as const,
      processedCount: 0,
      totalCount: transactionIds.length,
      failedCount: 0,
    },
  });

  logger.info(`[AI Categorization] Queued ${transactionIds.length} transactions for user ${userId}, job: ${jobId}`);

  return jobId;
}
