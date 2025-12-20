import { logger } from '@js/utils';
import { redisClient } from '@root/redis-client';

export interface RateLimitResult {
  allowed: boolean;
  remainingSeconds?: number;
  resetTime?: Date;
}

export class RateLimitService {
  /**
   * Check if an action is allowed based on rate limiting rules
   * @param key - Unique identifier for the rate limit (e.g., "user:123:price-sync")
   * @param windowSeconds - Time window in seconds for the rate limit
   * @param maxAttempts - Maximum number of attempts allowed in the window
   * @returns Promise<RateLimitResult>
   */
  static async checkRateLimit(key: string, windowSeconds: number, maxAttempts: number = 1): Promise<RateLimitResult> {
    const redisKey = `rate_limit:${key}`;

    try {
      // Get current count
      const currentCount = await redisClient.get(redisKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      if (count >= maxAttempts) {
        // Rate limit exceeded, get TTL to determine remaining seconds
        const ttl = await redisClient.ttl(redisKey);
        const remainingSeconds = ttl > 0 ? ttl : 0;
        const resetTime = new Date(Date.now() + remainingSeconds * 1000);

        return {
          allowed: false,
          remainingSeconds,
          resetTime,
        };
      }

      // Increment the counter
      const newCount = await redisClient.incr(redisKey);

      // Set expiration if this is the first attempt
      if (newCount === 1) {
        await redisClient.expire(redisKey, windowSeconds);
      }

      return {
        allowed: true,
      };
    } catch (error) {
      logger.error({
        message: `Rate limit check failed for key ${redisKey}, allowing request by default`,
        error: error as Error,
      });

      // If Redis fails, allow the request to proceed
      return {
        allowed: true,
      };
    }
  }

  /**
   * Reset rate limit for a specific key
   * @param key - The rate limit key to reset
   */
  static async resetRateLimit(key: string): Promise<void> {
    const redisKey = `rate_limit:${key}`;

    try {
      await redisClient.del(redisKey);
      logger.info(`Rate limit reset for key: ${key}`);
    } catch (error) {
      logger.error({
        message: `Failed to reset rate limit for key ${redisKey}`,
        error: error as Error,
      });
    }
  }

  /**
   * Get current rate limit status for a key
   * @param key - The rate limit key to check
   * @returns Promise<{ count: number; ttl: number }>
   */
  static async getRateLimitStatus(key: string): Promise<{ count: number; ttl: number }> {
    const redisKey = `rate_limit:${key}`;

    try {
      const [count, ttl] = await Promise.all([redisClient.get(redisKey), redisClient.ttl(redisKey)]);

      return {
        count: count ? parseInt(count, 10) : 0,
        ttl: ttl > 0 ? ttl : 0,
      };
    } catch (error) {
      logger.error({
        message: `Failed to get rate limit status for key ${redisKey}`,
        error: error as Error,
      });

      return { count: 0, ttl: 0 };
    }
  }
}
