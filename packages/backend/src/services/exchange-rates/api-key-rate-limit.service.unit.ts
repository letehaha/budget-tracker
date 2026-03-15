import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { redisClient } from '@root/redis-client';
import { endOfMonth } from 'date-fns';

import { ApiKeyRateLimitService } from './api-key-rate-limit.service';

// TODO: manage to work with redis
describe.skip('ApiKeyRateLimitService', () => {
  const testProvider = 'test-provider';
  const testApiKey = 'test-api-key-123456';

  beforeEach(async () => {
    // Clear any existing rate limits for test keys
    const keys = await redisClient.keys('*api_key_rate_limit:test-provider:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  });

  afterAll(async () => {
    // Cleanup test keys
    const keys = await redisClient.keys('*api_key_rate_limit:test-provider:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  });

  describe('markAsRateLimited', () => {
    it('should mark an API key as rate-limited', async () => {
      await ApiKeyRateLimitService.markAsRateLimited(testProvider, testApiKey, 'Test rate limit');

      const isLimited = await ApiKeyRateLimitService.isRateLimited(testProvider, testApiKey);
      expect(isLimited).toBe(true);
    });

    it('should set expiration to end of month', async () => {
      await ApiKeyRateLimitService.markAsRateLimited(testProvider, testApiKey);

      const info = await ApiKeyRateLimitService.getRateLimitInfo(testProvider, testApiKey);
      expect(info.isLimited).toBe(true);
      expect(info.ttl).toBeGreaterThan(0);

      // Calculate expected end of month
      const now = new Date();
      const endOfMonthDate = endOfMonth(now);
      const expectedTtl = Math.floor((endOfMonthDate.getTime() - now.getTime()) / 1000);

      // TTL should be close to end of month (within 5 seconds tolerance)
      expect(Math.abs(info.ttl! - expectedTtl)).toBeLessThan(5);
    });

    it('should store the reason for rate limiting', async () => {
      const reason = 'HTTP 429 Too Many Requests';
      await ApiKeyRateLimitService.markAsRateLimited(testProvider, testApiKey, reason);

      const info = await ApiKeyRateLimitService.getRateLimitInfo(testProvider, testApiKey);
      expect(info.reason).toBe(reason);
    });
  });

  describe('isRateLimited', () => {
    it('should return false for non-rate-limited key', async () => {
      const isLimited = await ApiKeyRateLimitService.isRateLimited(testProvider, 'non-existent-key');
      expect(isLimited).toBe(false);
    });

    it('should return true for rate-limited key', async () => {
      await ApiKeyRateLimitService.markAsRateLimited(testProvider, testApiKey);

      const isLimited = await ApiKeyRateLimitService.isRateLimited(testProvider, testApiKey);
      expect(isLimited).toBe(true);
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return isLimited: false for non-rate-limited key', async () => {
      const info = await ApiKeyRateLimitService.getRateLimitInfo(testProvider, 'non-existent-key');
      expect(info.isLimited).toBe(false);
      expect(info.reason).toBeUndefined();
      expect(info.expiresAt).toBeUndefined();
      expect(info.ttl).toBeUndefined();
    });

    it('should return full info for rate-limited key', async () => {
      const reason = 'Test limit';
      await ApiKeyRateLimitService.markAsRateLimited(testProvider, testApiKey, reason);

      const info = await ApiKeyRateLimitService.getRateLimitInfo(testProvider, testApiKey);
      expect(info.isLimited).toBe(true);
      expect(info.reason).toBe(reason);
      expect(info.expiresAt).toBeInstanceOf(Date);
      expect(info.ttl).toBeGreaterThan(0);
    });
  });

  describe('clearRateLimit', () => {
    it('should clear rate limit for a key', async () => {
      await ApiKeyRateLimitService.markAsRateLimited(testProvider, testApiKey);
      expect(await ApiKeyRateLimitService.isRateLimited(testProvider, testApiKey)).toBe(true);

      await ApiKeyRateLimitService.clearRateLimit(testProvider, testApiKey);
      expect(await ApiKeyRateLimitService.isRateLimited(testProvider, testApiKey)).toBe(false);
    });

    it('should not throw error when clearing non-existent key', async () => {
      await expect(ApiKeyRateLimitService.clearRateLimit(testProvider, 'non-existent-key')).resolves.not.toThrow();
    });
  });

  describe('filterAvailableKeys', () => {
    it('should return all keys when none are rate-limited', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const availableKeys = await ApiKeyRateLimitService.filterAvailableKeys(testProvider, keys);
      expect(availableKeys).toEqual(keys);
    });

    it('should filter out rate-limited keys', async () => {
      const keys = ['key1', 'key2', 'key3'];

      // Mark key2 as rate-limited
      await ApiKeyRateLimitService.markAsRateLimited(testProvider, 'key2');

      const availableKeys = await ApiKeyRateLimitService.filterAvailableKeys(testProvider, keys);
      expect(availableKeys).toEqual(['key1', 'key3']);
    });

    it('should return empty array when all keys are rate-limited', async () => {
      const keys = ['key1', 'key2'];

      // Mark all keys as rate-limited
      await ApiKeyRateLimitService.markAsRateLimited(testProvider, 'key1');
      await ApiKeyRateLimitService.markAsRateLimited(testProvider, 'key2');

      const availableKeys = await ApiKeyRateLimitService.filterAvailableKeys(testProvider, keys);
      expect(availableKeys).toEqual([]);
    });

    it('should handle empty input array', async () => {
      const availableKeys = await ApiKeyRateLimitService.filterAvailableKeys(testProvider, []);
      expect(availableKeys).toEqual([]);
    });
  });

  describe('API key hashing', () => {
    it('should use different Redis keys for different API keys', async () => {
      const key1 = 'api-key-111111';
      const key2 = 'api-key-222222';

      await ApiKeyRateLimitService.markAsRateLimited(testProvider, key1);
      await ApiKeyRateLimitService.markAsRateLimited(testProvider, key2);

      expect(await ApiKeyRateLimitService.isRateLimited(testProvider, key1)).toBe(true);
      expect(await ApiKeyRateLimitService.isRateLimited(testProvider, key2)).toBe(true);

      // Clearing one should not affect the other
      await ApiKeyRateLimitService.clearRateLimit(testProvider, key1);
      expect(await ApiKeyRateLimitService.isRateLimited(testProvider, key1)).toBe(false);
      expect(await ApiKeyRateLimitService.isRateLimited(testProvider, key2)).toBe(true);
    });
  });

  describe('provider isolation', () => {
    it('should isolate rate limits by provider', async () => {
      const provider1 = 'provider-1';
      const provider2 = 'provider-2';
      const apiKey = 'shared-key';

      await ApiKeyRateLimitService.markAsRateLimited(provider1, apiKey);

      expect(await ApiKeyRateLimitService.isRateLimited(provider1, apiKey)).toBe(true);
      expect(await ApiKeyRateLimitService.isRateLimited(provider2, apiKey)).toBe(false);
    });
  });
});
