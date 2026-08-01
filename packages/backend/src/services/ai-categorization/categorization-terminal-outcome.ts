import type { AiCategorizationProgressPayload } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { redisClient } from '@root/redis-client';

/**
 * How a run ended, kept briefly after the BullMQ job is gone (`removeOnComplete`
 * deletes it with the state flip), so a page reloaded around the end of a stopped
 * run can still explain why nothing was categorized. Consumed on read: the cause
 * is announced exactly once and later polls settle back to `idle`.
 */
export type CategorizationTerminalOutcome = Omit<AiCategorizationProgressPayload, 'status'> & {
  status: 'completed' | 'failed';
};

/** Long enough for a reload-and-look-again, short enough that the record never goes stale. */
const TERMINAL_OUTCOME_TTL_SECONDS = 3600;

export const buildTerminalOutcomeKey = ({ userId }: { userId: number }): string =>
  `ai-categorization-terminal-outcome-${userId}`;

/** Best effort: a failed write must never fail the run that produced it. */
export async function writeTerminalOutcome({
  userId,
  outcome,
}: {
  userId: number;
  outcome: CategorizationTerminalOutcome;
}): Promise<void> {
  try {
    await redisClient.set(
      buildTerminalOutcomeKey({ userId }),
      JSON.stringify(outcome),
      'EX',
      TERMINAL_OUTCOME_TTL_SECONDS,
    );
  } catch (error) {
    logger.error({
      message: `[AI Categorization] Failed to persist terminal outcome for user ${userId}`,
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

export async function consumeTerminalOutcome({
  userId,
}: {
  userId: number;
}): Promise<CategorizationTerminalOutcome | null> {
  const key = buildTerminalOutcomeKey({ userId });
  const rawOutcome = await redisClient.get(key);
  if (!rawOutcome) return null;

  await redisClient.del(key);

  try {
    return JSON.parse(rawOutcome) as CategorizationTerminalOutcome;
  } catch {
    return null;
  }
}
