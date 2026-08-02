import { AI_FEATURE, type AiCategorizationTriggerResponse } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ConflictError, TooManyRequests, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { redisClient } from '@root/redis-client';
import { createAIClient, describeMissingAiConfiguration } from '@services/ai';
import { RateLimitService } from '@services/common/rate-limit.service';
import { randomUUID } from 'node:crypto';

import { findCandidateTransactionIds } from './categorization-candidates';
import { queueCategorizationJob } from './categorization-queue';
import { CATEGORIZATION_SCOPE } from './categorization-scope';
import { getCategorizationStatus } from './categorization-status.service';

const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const RATE_LIMIT_MAX_TRIGGERS = 3;

/** Ceiling on how long one trigger may hold the gate. The work itself is a handful of
 *  queries plus an enqueue; the TTL only exists so a crashed process can't wedge the user. */
const TRIGGER_LOCK_TTL_SECONDS = 30;

const buildRateLimitKey = ({ userId }: { userId: number }) => `manual-categorization:user:${userId}`;

const buildTriggerLockKey = ({ userId }: { userId: number }) => `manual-categorization-trigger:user:${userId}`;

// Delete the lock only while this token still owns it. A plain DEL would let a trigger whose
// lock already expired wipe the lock a newer trigger has since taken. One Lua step.
const RELEASE_LOCK_IF_OWNED = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * Fails closed: a Redis outage denies the trigger rather than opening unlimited runs on
 * the server's AI budget. Skipped in development so a developer mashing the button
 * locally can't lock themselves out.
 */
async function consumeTriggerBudget({ userId }: { userId: number }): Promise<void> {
  if (process.env.NODE_ENV === 'development') return;

  const result = await RateLimitService.checkRateLimit(
    buildRateLimitKey({ userId }),
    RATE_LIMIT_WINDOW_SECONDS,
    RATE_LIMIT_MAX_TRIGGERS,
  );

  if (result.allowed && !result.serviceUnavailable) return;

  throw new TooManyRequests({
    message: t({ key: 'ai.categorizationRateLimited' }),
    details: {
      retryAfter: result.remainingSeconds ?? RATE_LIMIT_WINDOW_SECONDS,
      resetTime: result.resetTime?.toISOString(),
    },
  });
}

/**
 * Re-runs AI categorization on demand over everything still sitting in the user's default
 * category, or over `transactionIds` when the caller picked a subset. Budget is only spent
 * once there is real work to do and the user is on the server's credentials — their own key
 * or endpoint costs us nothing.
 *
 * Serialized per user: the "already running" check and the enqueue that acts on it are far
 * apart, so two concurrent triggers (double-click, two tabs) would both pass the check, both
 * spend budget, and both queue jobs over the same rows — leaving the older run untrackable
 * once the per-user job pointer is overwritten. The loser is told 409, same as a real run.
 */
export async function triggerCategorization({
  userId,
  transactionIds,
}: {
  userId: number;
  transactionIds?: string[];
}): Promise<AiCategorizationTriggerResponse> {
  const lockKey = buildTriggerLockKey({ userId });
  const lockToken = randomUUID();

  const acquired = await redisClient.set(lockKey, lockToken, 'EX', TRIGGER_LOCK_TTL_SECONDS, 'NX');
  if (!acquired) {
    throw new ConflictError({ message: t({ key: 'ai.categorizationAlreadyRunning' }) });
  }

  try {
    return await runTrigger({ userId, transactionIds });
  } finally {
    // Best effort: the lock expires on its own TTL anyway, and throwing here would either
    // turn an already-enqueued run into a 500 or replace the real error with a Redis one.
    try {
      await redisClient.eval(RELEASE_LOCK_IF_OWNED, 1, lockKey, lockToken);
    } catch (error) {
      logger.info(`[AI Categorization] Failed to release the trigger lock for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function runTrigger({
  userId,
  transactionIds,
}: {
  userId: number;
  transactionIds?: string[];
}): Promise<AiCategorizationTriggerResponse> {
  const status = await getCategorizationStatus({ userId });
  if (status.status === 'queued' || status.status === 'processing') {
    throw new ConflictError({ message: t({ key: 'ai.categorizationAlreadyRunning' }) });
  }

  const aiClient = await createAIClient({ userId, feature: AI_FEATURE.categorization });
  if (!aiClient) {
    throw new ValidationError({ message: await describeMissingAiConfiguration({ userId }) });
  }

  const candidateIds = await findCandidateTransactionIds({ userId, transactionIds });
  if (candidateIds.length === 0) {
    return { enqueued: false, totalCount: 0 };
  }

  if (!aiClient.usingUserKey) {
    await consumeTriggerBudget({ userId });
  }

  await queueCategorizationJob({
    userId,
    transactionIds: candidateIds,
    scope: CATEGORIZATION_SCOPE.defaultCategoryOnly,
  });

  return { enqueued: true, totalCount: candidateIds.length };
}
