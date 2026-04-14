import type { RedisOptions } from 'ioredis';

/**
 * Builds Redis connection options from either REDIS_URL (for managed Redis services
 * like Railway that require authentication) or APPLICATION_REDIS_HOST (for simple
 * host-only connections like local Docker).
 */
export function getRedisConnectionConfig(): RedisOptions {
  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL);
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      ...(url.password && { password: decodeURIComponent(url.password) }),
      ...(url.username && url.username !== 'default' && { username: url.username }),
    };
  }

  return {
    host: process.env.APPLICATION_REDIS_HOST,
  };
}
