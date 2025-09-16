import { redisKeyFormatter } from '@common/lib/redis';
import { redisClient } from '@root/redis-client';

import { logger } from './logger';

interface CacheConfig {
  ttl?: number; // TTL in seconds, default 1 hour
  logPrefix?: string; // Prefix for log messages
  parseJson?: boolean; // Whether to parse JSON or return raw strings
}

export class CacheClient<T = unknown> {
  private readonly ttl: number;
  private readonly logPrefix: string;
  private readonly parseJson: boolean;
  private currentCacheKey?: string;

  constructor(config: CacheConfig = {}) {
    this.ttl = config.ttl ?? 3600;
    this.logPrefix = config.logPrefix ?? 'Cache';
    this.parseJson = config.parseJson ?? true;
  }

  setCacheKey(key: string): this {
    this.currentCacheKey = key;
    return this;
  }

  async read(key?: string): Promise<T | null> {
    const cacheKey = key ?? this.currentCacheKey;
    if (!cacheKey) {
      logger.error({ message: `${this.logPrefix} read skipped: No cache key provided and no default key set` });
      return null;
    }

    try {
      const cached = await redisClient.get(redisKeyFormatter(cacheKey));
      if (cached !== null) {
        return this.parseJson ? JSON.parse(cached) : (cached as T);
      } else {
        return null;
      }
    } catch (error) {
      logger.error({ message: `${this.logPrefix} read error for key ${cacheKey}:`, error: error as Error });
      return null;
    }
  }

  async write(params: { key?: string; value: T; ttl?: number }): Promise<void> {
    const cacheKey = params.key ?? this.currentCacheKey;

    if (!cacheKey) {
      logger.error({ message: `${this.logPrefix} write skipped: No cache key provided and no default key set` });
      return;
    }

    const ttl = params.ttl ?? this.ttl;

    try {
      const serializedValue = typeof params.value === 'string' ? params.value : JSON.stringify(params.value);
      await redisClient.setEx(redisKeyFormatter(cacheKey), ttl, serializedValue);
    } catch (error) {
      logger.error({ message: `${this.logPrefix} write error for key ${cacheKey}:`, error: error as Error });
    }
  }

  async delete(keyOrPattern: string, isPattern = false): Promise<void> {
    try {
      if (isPattern) {
        const keys = await redisClient.keys(keyOrPattern);
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      } else {
        await redisClient.del(keyOrPattern);
      }
    } catch (error) {
      logger.error({ message: `${this.logPrefix} delete error for ${keyOrPattern}:`, error: error as Error });
    }
  }

  async readBatch(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();

    try {
      const cachedResults = await redisClient.mGet(keys);

      keys.forEach((key, index) => {
        const cached = cachedResults[index];
        if (cached !== null && cached !== undefined) {
          const parsedValue = this.parseJson ? JSON.parse(cached) : (cached as T);
          results.set(redisKeyFormatter(key), parsedValue);
        } else {
          results.set(redisKeyFormatter(key), null);
        }
      });
    } catch (error) {
      console.warn(`${this.logPrefix} batch read error:`, error);
      keys.forEach((key) => results.set(redisKeyFormatter(key), null));
    }

    return results;
  }
}
