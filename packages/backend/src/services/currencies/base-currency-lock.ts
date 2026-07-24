import { API_ERROR_CODES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { LockedError } from '@js/errors';
import { redisClient } from '@root/redis-client';

/**
 * How long the base-currency lock lives before Redis expires it. Long enough to
 * cover a full recalc on a large dataset; a job still running past it heartbeats
 * the TTL so the lock never lapses mid-recalc.
 */
const LOCK_TTL_SECONDS = 4 * 3600;

/** The one key both the 423 route guard and every background writer read. */
export const buildLockKey = (userId: number) => `change-base-currency:user:${userId}`;

// Delete the lock only when it still holds this jobId. A plain GET-then-DEL
// release is not atomic — a job whose lock expired and was re-acquired by a
// newer job would otherwise delete the newer job's lock. Run as one Lua step.
const RELEASE_LOCK_IF_OWNED = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

// Extend the TTL only when the lock still holds this jobId, so a heartbeat from a
// stale job can't keep a newer owner's lock alive. Compare-and-expire in one step.
const EXTEND_LOCK_TTL_IF_OWNED = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("expire", KEYS[1], ARGV[2])
else
  return 0
end`;

/**
 * True while a base-currency recalculation holds the user's lock. Background
 * writers — bank syncs, import jobs, crons, and refreshes triggered by GET
 * requests — call this to self-abort or skip. The 423 route middleware only
 * covers authenticated mutating HTTP routes; queue workers, cron ticks, and
 * lazy GET writes are invisible to it, so each reads the same lock key the
 * middleware does and stops writing while the recalc rewrites every ref* amount.
 */
export const isBaseCurrencyChangeLocked = async ({ userId }: { userId: number }): Promise<boolean> => {
  const lockValue = await redisClient.get(buildLockKey(userId));
  return lockValue !== null;
};

/**
 * Take the lock for this job. `SET NX` is the dedupe: a second concurrent change
 * for the same user fails to acquire and is rejected upstream rather than queued.
 */
export async function acquireBaseCurrencyLock({ userId, jobId }: { userId: number; jobId: string }): Promise<boolean> {
  const result = await redisClient.set(buildLockKey(userId), jobId, 'EX', LOCK_TTL_SECONDS, 'NX');
  return result !== null;
}

/**
 * Release the base-currency lock only if it is still held by this job. Used by the
 * worker's `finally` and by the status endpoint's orphan-lock reconciliation.
 */
export async function releaseBaseCurrencyLockIfOwned({
  userId,
  jobId,
}: {
  userId: number;
  jobId: string;
}): Promise<void> {
  await redisClient.eval(RELEASE_LOCK_IF_OWNED, 1, buildLockKey(userId), jobId);
}

/**
 * Push the lock's expiry back out to the full TTL, but only while this job still
 * owns it. The worker heartbeats this so a recalc running past the TTL never lets
 * the lock lapse and reopen the guarded routes mid-rewrite.
 */
export async function extendBaseCurrencyLockTtlIfOwned({
  userId,
  jobId,
}: {
  userId: number;
  jobId: string;
}): Promise<void> {
  await redisClient.eval(EXTEND_LOCK_TTL_IF_OWNED, 1, buildLockKey(userId), jobId, LOCK_TTL_SECONDS);
}

/**
 * Throw if the requester or any other party is mid base-currency migration. Callers
 * that touch more than one user's data (share accept, back-invite) check every party,
 * since the route guard only inspects the requester's lock.
 *
 * The requester's own lock uses the app-blocking code so their global 423 handler
 * raises the full-app overlay; another party's lock uses a distinct code so the
 * requester only sees a retryable error, not a frozen app for someone else's migration.
 */
export async function assertUsersNotBaseCurrencyLocked({
  requesterUserId,
  otherUserIds,
}: {
  requesterUserId: number;
  otherUserIds: number[];
}): Promise<void> {
  const [requesterLocked, ...othersLocked] = await Promise.all([
    isBaseCurrencyChangeLocked({ userId: requesterUserId }),
    ...otherUserIds.map((userId) => isBaseCurrencyChangeLocked({ userId })),
  ]);

  if (requesterLocked) {
    throw new LockedError({
      code: API_ERROR_CODES.baseCurrencyChangeInProgress,
      message: t({ key: 'currencies.baseCurrencyChangeInProgress' }),
    });
  }

  if (othersLocked.some(Boolean)) {
    throw new LockedError({
      code: API_ERROR_CODES.baseCurrencyChangeInProgressOtherUser,
      message: t({ key: 'currencies.baseCurrencyChangeInProgressOtherUser' }),
    });
  }
}
