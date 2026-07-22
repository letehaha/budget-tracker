import {
  BASE_CURRENCY_CHANGE_STEPS,
  type BaseCurrencyChangeStatus,
  type BaseCurrencyChangeStep,
} from '@bt/shared/types';
import { redisClient } from '@root/redis-client';

import { baseCurrencyChangeQueue, buildLastJobPointerKey } from './base-currency-change-queue';
import { releaseBaseCurrencyLockIfOwned } from './base-currency-lock';

/**
 * Resolve the user's current base-currency-change status from the per-user pointer
 * key and the BullMQ job it points at. Never 404s: the frontend calls this on every
 * boot, so "no job" is a 200 `idle`.
 *
 * Also the crash-recovery path: whenever the resolved state is terminal (or the job
 * aged out) and the lock still holds this jobId — a worker killed before its
 * `finally` ran — the lock is released here before responding, so a polling client
 * naturally unblocks every mutating route instead of waiting out the 4h TTL.
 */
export async function getBaseCurrencyChangeStatus({ userId }: { userId: number }): Promise<BaseCurrencyChangeStatus> {
  const jobId = await redisClient.get(buildLastJobPointerKey(userId));
  // Rule: no pointer → never ran (or the pointer was cleared) → idle.
  if (!jobId) return { state: 'idle' };

  const job = await baseCurrencyChangeQueue.getJob(jobId);
  // Rule: job aged out of retention while the pointer lingers → idle, but first
  // release the lock in case a crashed worker left it holding this jobId.
  if (!job) {
    await releaseBaseCurrencyLockIfOwned({ userId, jobId });
    return { state: 'idle' };
  }

  // Rule: defense-in-depth — a pointer must only ever resolve its own user's job.
  if (job.data.userId !== userId) return { state: 'idle' };

  const state = await job.getState();
  // The job's progress blob is untyped; only surface `step` when it's a real
  // recalc phase so a malformed value never leaks through as a bogus step.
  const rawStep = ((job.progress ?? {}) as { step?: string }).step;
  const step: BaseCurrencyChangeStep | undefined = BASE_CURRENCY_CHANGE_STEPS.includes(
    rawStep as BaseCurrencyChangeStep,
  )
    ? (rawStep as BaseCurrencyChangeStep)
    : undefined;
  const startedAt = job.processedOn ?? undefined;

  if (state === 'completed') {
    const result = job.returnvalue;
    // Rule (returnvalue-visibility race): state flipped to completed but the
    // returnvalue blob isn't visible yet — report running so the client doesn't
    // fire its completion handler without a result. The next poll gets the payload.
    if (!result) {
      return { state: 'running', jobId, step, startedAt };
    }
    await releaseBaseCurrencyLockIfOwned({ userId, jobId });
    return { state: 'completed', jobId, finishedAt: job.finishedOn ?? Date.now(), result };
  }

  if (state === 'failed') {
    // Rule (failedReason race): the snapshot's failedReason can lag the state flip —
    // re-fetch once, then settle on a generic message. Never report running for a
    // failed job, or a poll-only client (SSE down) would spin forever.
    let error = job.failedReason;
    if (!error) {
      const settled = (await baseCurrencyChangeQueue.getJob(jobId)) ?? job;
      error = settled.failedReason || 'Base currency change failed';
    }
    await releaseBaseCurrencyLockIfOwned({ userId, jobId });
    return { state: 'failed', jobId, finishedAt: job.finishedOn ?? undefined, error };
  }

  // Rule (state mapping): active → running; waiting/delayed (and any other
  // not-yet-terminal state) → queued.
  if (state === 'active') {
    return { state: 'running', jobId, step, startedAt };
  }
  return { state: 'queued', jobId };
}
