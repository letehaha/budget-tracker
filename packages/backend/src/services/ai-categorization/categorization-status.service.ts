import { AiCategorizationStatus } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { redisClient } from '@root/redis-client';

import { buildFailedRunStatus, parseProgressCounters } from './categorization-progress';
import { buildLastCategorizationJobPointerKey, categorizationQueue } from './categorization-queue';

const IDLE: AiCategorizationStatus = { status: 'idle' };

/**
 * Resolve the user's current AI categorization status from the per-user pointer
 * key and the BullMQ job it points at. Never 404s: the frontend calls this on
 * boot to rehydrate the header progress indicator, so "no job" is a 200 `idle`.
 *
 * Completed jobs are removed from the queue on completion (`removeOnComplete`),
 * so a pointer that resolves to no job means the last run is over — idle.
 */
export async function getCategorizationStatus({ userId }: { userId: number }): Promise<AiCategorizationStatus> {
  const jobId = await redisClient.get(buildLastCategorizationJobPointerKey(userId));
  if (!jobId) return IDLE;

  const job = await categorizationQueue.getJob(jobId);
  if (!job) return IDLE;

  // Defense-in-depth: a pointer must only ever resolve its own user's job. The
  // key is per-user, so this firing means key construction or the stored value
  // is corrupted — never serve the foreign job, but make the bug loud.
  if (job.data.userId !== userId) {
    logger.error(
      `[AI Categorization] Last-job pointer for user ${userId} resolved to job ${jobId} owned by user ${job.data.userId}`,
    );
    return IDLE;
  }

  const state = await job.getState();
  const totalCount = job.data.transactionIds.length;

  // `removeOnComplete: true` deletes a finished job atomically with the state
  // flip, so a completed run is normally observed as "no job" → idle above.
  // Kept as an explicit mapping in case that retention policy ever changes.
  if (state === 'completed') return IDLE;

  if (state === 'failed') {
    return buildFailedRunStatus({ progress: job.progress, totalCount });
  }

  if (state === 'active') {
    return { status: 'processing', totalCount, ...parseProgressCounters(job.progress) };
  }

  // waiting / delayed (retry backoff) / any other not-yet-started state
  return { status: 'queued', processedCount: 0, totalCount, failedCount: 0 };
}
