import { logger } from '@js/utils/logger';
import { Job, Queue, Worker } from 'bullmq';

import { SSE_EVENT_TYPES, sseManager } from '../common/sse';
import { categorizeTransactions } from './categorization-service';

interface CategorizationJobData {
  userId: number;
  transactionIds: number[];
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
    const { userId, transactionIds } = job.data;

    logger.info(
      `[AI Categorization Worker] Processing job for user ${userId}, ${transactionIds.length} transactions, attempt ${job.attemptsMade + 1}`,
    );

    const result = await categorizeTransactions({
      userId,
      transactionIds,
      totalTransactionCount: transactionIds.length,
    });

    if (result.failed.length > 0) {
      logger.warn(`[AI Categorization Worker] ${result.failed.length} transactions failed for user ${userId}`);
    }

    return {
      successful: result.successful.length,
      failed: result.failed.length,
    };
  },
  {
    connection,
    // magic value. No reason to make it less, yet better keep it conservative at this level
    concurrency: 5,
  },
);

// Worker event listeners
categorizationWorker.on('completed', (job, result) => {
  logger.info(`[AI Categorization Worker] Job ${job.id} completed: ${JSON.stringify(result)}`);

  // Notify connected clients via SSE
  const { userId, transactionIds } = job.data;

  // Send progress event with completed status
  sseManager.sendToUser({
    userId,
    event: SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS,
    data: {
      status: 'completed' as const,
      processedCount: result.successful + result.failed,
      totalCount: transactionIds.length,
      failedCount: result.failed,
    },
  });
});

categorizationWorker.on('failed', (job, err) => {
  logger.error({ message: `[AI Categorization Worker] Job ${job?.id} failed`, error: err });

  // Send failed progress event
  if (job) {
    const { userId, transactionIds } = job.data;
    sseManager.sendToUser({
      userId,
      event: SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS,
      data: {
        status: 'failed' as const,
        processedCount: 0,
        totalCount: transactionIds.length,
        failedCount: transactionIds.length,
      },
    });
  }
});

categorizationWorker.on('error', (err) => {
  // Ignore "Connection is closed" errors during test teardown
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[AI Categorization Worker] Worker error', error: err });
  }
});

/**
 * Queue transactions for AI categorization
 * This is the main entry point called after bank sync completes
 */
export async function queueCategorizationJob({
  userId,
  transactionIds,
}: {
  userId: number;
  transactionIds: number[];
}): Promise<string> {
  if (transactionIds.length === 0) {
    logger.info(`[AI Categorization] No transactions to categorize for user ${userId}`);
    return '';
  }

  const jobId = `categorization-${userId}-${Date.now()}`;

  await categorizationQueue.add(
    jobId,
    {
      userId,
      transactionIds,
    },
    {
      jobId,
    },
  );

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
