import { AiCategorizationStatus } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { redisClient } from '@root/redis-client';

import { parseProgressCounters } from './categorization-progress';
import { buildLastCategorizationJobPointerKey, categorizationQueue } from './categorization-queue';
import { consumeTerminalOutcome } from './categorization-terminal-outcome';

const IDLE: AiCategorizationStatus = { status: 'idle' };

/**
 * Resolve the user's categorization status from the per-user job pointer. "No job"
 * is `idle`, never an error. Finished jobs vanish from the queue, so how a run
 * ended comes from the terminal-outcome record instead.
 */
export async function getCategorizationStatus({ userId }: { userId: number }): Promise<AiCategorizationStatus> {
  const jobId = await redisClient.get(buildLastCategorizationJobPointerKey({ userId }));
  if (!jobId) return IDLE;

  const job = await categorizationQueue.getJob(jobId);
  if (!job) {
    return (await consumeTerminalOutcome({ userId })) ?? IDLE;
  }

  // A per-user pointer can only resolve its own user's job; anything else is corruption.
  if (job.data.userId !== userId) {
    logger.error(`[AI Categorization] Last-job pointer for user ${userId} resolved to a foreign job ${jobId}`);
    return IDLE;
  }

  const state = await job.getState();
  const totalCount = job.data.transactionIds.length;

  if (state === 'failed') {
    // Terminal: a pending retry shows as `delayed`, never `failed`. Once the outcome
    // is consumed, the lingering failed job settles to idle.
    return (await consumeTerminalOutcome({ userId })) ?? IDLE;
  }

  if (state === 'active') {
    return { status: 'processing', totalCount, ...parseProgressCounters({ progress: job.progress }) };
  }

  // waiting / delayed (retry backoff) / anything else not yet started. Keeping the
  // blob's counters stops a mid-run backoff from reading as "queued, 0 processed".
  return { status: 'queued', totalCount, ...parseProgressCounters({ progress: job.progress }) };
}
