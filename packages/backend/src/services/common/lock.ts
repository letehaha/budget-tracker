import { redisKeyFormatter } from '@common/lib/redis';
import { LockedError } from '@js/errors';
import { logger } from '@js/utils';
import { redisClient } from '@root/redis-client';

const LOCK_TTL_SECONDS = 60 * 30; // 30 minutes

type AsyncFunction<T extends unknown[], R> = (...args: T) => Promise<R>;

/**
 * A higher-order function that wraps an async function with a distributed lock using Redis.
 * It ensures that only one instance of the wrapped function can run at a time for a given lock key.
 *
 * @param lockKey A unique key for the lock in Redis.
 * @param fn The async function to execute while holding the lock.
 * @param options Optional settings, like lock TTL.
 * @returns An async function that will first attempt to acquire the lock before executing.
 * @throws {LockedError} If the lock is already held by another process.
 */
export function withLock<T extends unknown[], R>(
  lockKey: string,
  fn: AsyncFunction<T, R>,
  options: { ttl?: number } = {},
): AsyncFunction<T, R> {
  return async (...args: T): Promise<R> => {
    const lockValue = Date.now().toString();
    const ttl = options.ttl || LOCK_TTL_SECONDS;

    // Ensure Redis client is connected (handles lazy connection)
    if (!redisClient.isReady) {
      await redisClient.connect();
    }

    // Try to acquire the lock atomically.
    // 'NX' means only set the key if it does not already exist.
    // 'EX' sets the expiration time in seconds.
    const acquired = await redisClient.set(redisKeyFormatter(lockKey), lockValue, {
      NX: true,
      EX: ttl,
    });

    if (!acquired) {
      logger.warn(`Could not acquire lock for key: "${lockKey}". Process is already running.`);
      throw new LockedError({
        message: `Sync process for "${lockKey}" is already locked.`,
      });
    }

    logger.info(`Lock acquired for key: "${lockKey}".`);

    try {
      // Execute the original function now that we have the lock.
      return await fn(...args);
    } finally {
      // Always release the lock, even if the function throws an error.
      // We check if the lock is still ours before deleting to avoid deleting
      // a lock acquired by another process after ours expired.
      if (!redisClient.isReady) {
        await redisClient.connect();
      }
      const currentValue = await redisClient.get(redisKeyFormatter(lockKey));
      if (currentValue === lockValue) {
        await redisClient.del(redisKeyFormatter(lockKey));
        logger.info(`Lock released for key: "${lockKey}".`);
      }
    }
  };
}
