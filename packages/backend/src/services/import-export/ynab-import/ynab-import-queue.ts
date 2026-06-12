import {
  SSE_EVENT_TYPES,
  type YnabAccountMapping,
  type YnabImportProgress,
  type YnabImportSummary,
} from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { SentryTraceData, withQueueProcessSpan, withQueuePublishSpan } from '@js/utils/sentry';
import { sseManager } from '@services/common/sse';
import { Job, Queue, Worker } from 'bullmq';

import { executeYnabImport } from './execute-import.service';

interface YnabImportJobData extends SentryTraceData {
  userId: number;
  fileContent: string;
  accountMapping: YnabAccountMapping;
}

interface YnabImportJobResult {
  summary: YnabImportSummary;
  totalCount: number;
}

const connection = {
  host: process.env.APPLICATION_REDIS_HOST,
  maxRetriesPerRequest: null,
  connectTimeout: 20000,
  keepAlive: 10000,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
};

/** BullMQ queue name. Namespaced by Jest worker id so parallel test runs don't
 *  cross-fire jobs into each other's workers. */
const ynabImportQueueName =
  process.env.NODE_ENV === 'test' && process.env.JEST_WORKER_ID
    ? `ynab-import-${process.env.JEST_WORKER_ID}`
    : 'ynab-import';

export const ynabImportQueue = new Queue<YnabImportJobData, YnabImportJobResult>(ynabImportQueueName, {
  connection,
  defaultJobOptions: {
    attempts: 1, // YNAB import is a single-shot user-triggered op; do not auto-retry partial commits.
    removeOnComplete: { age: 24 * 3600 }, // Keep for a day so /status can still fetch.
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

ynabImportQueue.on('error', (err) => {
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[YNAB Import Queue] Queue error', error: err });
  }
});

/** Dynamic progress throttling: emit SSE at most every 25 rows so we don't
 *  swamp the channel on large imports. The final 'completed' event always
 *  carries the true `processedCount` and summary. */
const PROGRESS_SSE_THROTTLE = 25;

export const ynabImportWorker = new Worker<YnabImportJobData, YnabImportJobResult>(
  ynabImportQueueName,
  async (job: Job<YnabImportJobData>) => {
    return withQueueProcessSpan({
      queueName: ynabImportQueueName,
      job,
      fn: async () => {
        const { userId, fileContent, accountMapping } = job.data;

        sendProgress({
          userId,
          payload: {
            jobId: job.id!,
            status: 'running',
            processedCount: 0,
            totalCount: 0,
          },
        });

        let lastEmittedAt = 0;
        let lastTotal = 0;
        const summary = await executeYnabImport({
          userId,
          fileContent,
          accountMapping,
          onProgress: async (processedCount, totalCount) => {
            lastTotal = totalCount;
            // Persist progress on the job itself so /status polling works
            // even with no SSE listener (e.g. user closed the tab).
            await job.updateProgress({ processedCount, totalCount });
            if (processedCount - lastEmittedAt >= PROGRESS_SSE_THROTTLE || processedCount === totalCount) {
              lastEmittedAt = processedCount;
              sendProgress({
                userId,
                payload: {
                  jobId: job.id!,
                  status: 'running',
                  processedCount,
                  totalCount,
                },
              });
            }
          },
        });

        return { summary, totalCount: lastTotal };
      },
    });
  },
  {
    connection,
    concurrency: 2,
  },
);

ynabImportWorker.on('completed', (job, result) => {
  sendProgress({
    userId: job.data.userId,
    payload: {
      jobId: job.id!,
      status: 'completed',
      processedCount: result.totalCount,
      totalCount: result.totalCount,
      summary: result.summary,
    },
  });
});

ynabImportWorker.on('failed', (job, err) => {
  logger.error({ message: `[YNAB Import Worker] Job ${job?.id} failed`, error: err });
  if (!job) return;
  // Report the partial progress reached before the crash so the user can see
  // how many rows actually landed instead of a misleading "0 / 0 failed".
  const { processedCount, totalCount } = readJobProgress(job);
  sendProgress({
    userId: job.data.userId,
    payload: {
      jobId: job.id!,
      status: 'failed',
      processedCount,
      totalCount,
      error: err.message,
    },
  });
});

ynabImportWorker.on('error', (err) => {
  if (!err.message.includes('Connection is closed')) {
    logger.error({ message: '[YNAB Import Worker] Worker error', error: err });
  }
});

function sendProgress({ userId, payload }: { userId: number; payload: YnabImportProgress }) {
  sseManager.sendToUser({
    userId,
    event: SSE_EVENT_TYPES.YNAB_IMPORT_PROGRESS,
    data: payload,
  });
}

/** Pull the throttled `{processedCount, totalCount}` blob the worker writes
 *  via `job.updateProgress`. Returns zeros when nothing has been recorded yet
 *  (e.g. the job died before the first tick). */
function readJobProgress(job: Job<YnabImportJobData>): { processedCount: number; totalCount: number } {
  const progress = (job.progress ?? {}) as { processedCount?: number; totalCount?: number };
  return {
    processedCount: progress.processedCount ?? 0,
    totalCount: progress.totalCount ?? 0,
  };
}

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
  const jobId = `ynab-import-${userId}-${Date.now()}`;
  const data: YnabImportJobData = { userId, fileContent, accountMapping };

  await withQueuePublishSpan({
    queueName: ynabImportQueueName,
    messageId: jobId,
    payloadSize: JSON.stringify(data).length,
    fn: async (traceData) => {
      await ynabImportQueue.add(jobId, { ...data, ...traceData }, { jobId });
    },
  });

  sendProgress({
    userId,
    payload: { jobId, status: 'queued', processedCount: 0, totalCount: 0 },
  });

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
  const job = await ynabImportQueue.getJob(jobId);
  if (!job) return null;
  if (job.data.userId !== userId) return null;

  const state = await job.getState();
  const { processedCount, totalCount } = readJobProgress(job);

  if (state === 'completed') {
    const result = job.returnvalue;
    if (!result?.summary) {
      // BullMQ marked the job completed but the returnvalue blob has not
      // surfaced yet (rare write-vs-read race right after the handler resolves).
      // Treat as still-running so the next poll picks up the real result.
      return { jobId, status: 'running', processedCount, totalCount };
    }
    return {
      jobId,
      status: 'completed',
      processedCount: result.totalCount,
      totalCount: result.totalCount,
      summary: result.summary,
    };
  }
  if (state === 'failed') {
    return {
      jobId,
      status: 'failed',
      processedCount,
      totalCount,
      error: job.failedReason ?? 'Unknown error',
    };
  }
  return {
    jobId,
    status: state === 'waiting' || state === 'delayed' ? 'queued' : 'running',
    processedCount,
    totalCount,
  };
}
