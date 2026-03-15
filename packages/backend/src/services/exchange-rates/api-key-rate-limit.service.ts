import { logger } from '@js/utils';
import { redisClient } from '@root/redis-client';
import { endOfMonth } from 'date-fns';

/**
 * Service to track API keys that have hit rate limits and "disable" them
 * until the end of the month to avoid wasting API calls.
 */
// oxlint-disable-next-line typescript/no-extraneous-class -- static utility class used as a namespace
export class ApiKeyRateLimitService {
  private static readonly REDIS_PREFIX = 'api_key_rate_limit';

  /**
   * Generate Redis key for a specific API key hash
   * @param apiKeyHash - Hashed or truncated identifier for the API key (not the full key for security)
   */
  private static getRedisKey(provider: string, apiKeyHash: string): string {
    return `${this.REDIS_PREFIX}:${provider}:${apiKeyHash}`;
  }

  /**
   * Create a hash/identifier from API key (last 6 characters for logging/tracking)
   * This avoids storing full API keys in Redis
   */
  private static hashApiKey(apiKey: string): string {
    return apiKey.slice(-6);
  }

  /**
   * Calculate seconds until the end of current month
   */
  private static getSecondsUntilEndOfMonth(): number {
    const now = new Date();
    const endOfMonthDate = endOfMonth(now);
    const secondsRemaining = Math.floor((endOfMonthDate.getTime() - now.getTime()) / 1000);
    return Math.max(secondsRemaining, 0);
  }

  /**
   * Mark an API key as rate-limited until the end of the month
   * @param provider - The provider name (e.g., 'apilayer', 'polygon')
   * @param apiKey - The API key that hit rate limit
   * @param reason - Optional reason for rate limiting (e.g., '429 Too Many Requests')
   */
  static async markAsRateLimited(provider: string, apiKey: string, reason?: string): Promise<void> {
    const apiKeyHash = this.hashApiKey(apiKey);
    const redisKey = this.getRedisKey(provider, apiKeyHash);
    const ttl = this.getSecondsUntilEndOfMonth();

    try {
      await redisClient.setex(redisKey, ttl, reason || 'Rate limit exceeded');

      const endOfMonthDate = endOfMonth(new Date());
      logger.info(
        `API key marked as rate-limited: provider=${provider}, ` +
          `keyHash=***${apiKeyHash}, expires=${endOfMonthDate.toISOString()}, ` +
          `reason=${reason || 'Rate limit exceeded'}`,
      );
    } catch (error) {
      logger.error({
        message: `Failed to mark API key as rate-limited in Redis: provider=${provider}, keyHash=***${apiKeyHash}`,
        error: error as Error,
      });
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Check if an API key is currently rate-limited
   * @param provider - The provider name (e.g., 'apilayer', 'polygon')
   * @param apiKey - The API key to check
   * @returns Promise<boolean> - true if rate-limited, false if available
   */
  static async isRateLimited(provider: string, apiKey: string): Promise<boolean> {
    const apiKeyHash = this.hashApiKey(apiKey);
    const redisKey = this.getRedisKey(provider, apiKeyHash);

    try {
      const value = await redisClient.get(redisKey);
      return value !== null;
    } catch (error) {
      logger.error({
        message: `Failed to check API key rate limit status in Redis: provider=${provider}, keyHash=***${apiKeyHash}`,
        error: error as Error,
      });
      // If Redis fails, assume key is available (fail open)
      return false;
    }
  }

  /**
   * Get rate limit info for an API key
   * @param provider - The provider name
   * @param apiKey - The API key to check
   * @returns Promise<{ isLimited: boolean; reason?: string; expiresAt?: Date }>
   */
  static async getRateLimitInfo(
    provider: string,
    apiKey: string,
  ): Promise<{ isLimited: boolean; reason?: string; expiresAt?: Date; ttl?: number }> {
    const apiKeyHash = this.hashApiKey(apiKey);
    const redisKey = this.getRedisKey(provider, apiKeyHash);

    try {
      const [reason, ttl] = await Promise.all([redisClient.get(redisKey), redisClient.ttl(redisKey)]);

      if (reason === null) {
        return { isLimited: false };
      }

      const expiresAt = ttl > 0 ? new Date(Date.now() + ttl * 1000) : undefined;

      return {
        isLimited: true,
        reason,
        expiresAt,
        ttl: ttl > 0 ? ttl : undefined,
      };
    } catch (error) {
      logger.error({
        message: `Failed to get API key rate limit info from Redis: provider=${provider}, keyHash=***${apiKeyHash}`,
        error: error as Error,
      });
      return { isLimited: false };
    }
  }

  /**
   * Clear rate limit for an API key (useful for testing or manual override)
   * @param provider - The provider name
   * @param apiKey - The API key to clear
   */
  static async clearRateLimit(provider: string, apiKey: string): Promise<void> {
    const apiKeyHash = this.hashApiKey(apiKey);
    const redisKey = this.getRedisKey(provider, apiKeyHash);

    try {
      await redisClient.del(redisKey);
      logger.info(`API key rate limit cleared: provider=${provider}, keyHash=***${apiKeyHash}`);
    } catch (error) {
      logger.error({
        message: `Failed to clear API key rate limit in Redis: provider=${provider}, keyHash=***${apiKeyHash}`,
        error: error as Error,
      });
    }
  }

  /**
   * Filter out rate-limited API keys from a list
   * @param provider - The provider name
   * @param apiKeys - Array of API keys to filter
   * @returns Promise<string[]> - Filtered array containing only non-rate-limited keys
   */
  static async filterAvailableKeys(provider: string, apiKeys: string[]): Promise<string[]> {
    const availableKeys: string[] = [];

    for (const key of apiKeys) {
      const isLimited = await this.isRateLimited(provider, key);
      if (!isLimited) {
        availableKeys.push(key);
      } else {
        logger.info(`Skipping rate-limited API key: provider=${provider}, keyHash=***${this.hashApiKey(key)}`);
      }
    }

    return availableKeys;
  }
}
