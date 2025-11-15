import { describe, expect, it, afterEach } from '@jest/globals';
import { redisClient } from '@root/redis-client';

import {
  clearAllSyncStatuses,
  setAccountSyncStatus,
  getAccountSyncStatus,
  SyncStatus,
  REDIS_KEYS,
  updateLastAutoSync,
  setAccountPriority,
} from './sync-status-tracker';

describe('Sync Status Tracker - clearAllSyncStatuses', () => {
  afterEach(async () => {
    // Clean up after each test
    const keys = await redisClient.keys('*account:*:sync-status*');
    const userKeys = await redisClient.keys('*user:*:last-auto-sync*');
    const priorityKeys = await redisClient.keys('*account:*:priority*');
    const allKeys = [...keys, ...userKeys, ...priorityKeys];
    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
    }
  });

  it('should reset QUEUED status to IDLE on startup', async () => {
    const accountId = 12345;

    // Set account to QUEUED status
    await setAccountSyncStatus(accountId, SyncStatus.QUEUED);

    // Verify it's QUEUED
    const beforeCleanup = await getAccountSyncStatus(accountId);
    expect(beforeCleanup?.status).toBe(SyncStatus.QUEUED);

    // Run cleanup
    await clearAllSyncStatuses();

    // Verify it's now IDLE with error message
    const afterCleanup = await getAccountSyncStatus(accountId);
    expect(afterCleanup?.status).toBe(SyncStatus.IDLE);
    expect(afterCleanup?.error).toBe('Sync interrupted by server restart');
    expect(afterCleanup?.startedAt).toBeNull();
    expect(afterCleanup?.completedAt).toBeNull();
  });

  it('should reset SYNCING status to IDLE on startup', async () => {
    const accountId = 12346;

    // Set account to SYNCING status
    await setAccountSyncStatus(accountId, SyncStatus.SYNCING);

    // Verify it's SYNCING
    const beforeCleanup = await getAccountSyncStatus(accountId);
    expect(beforeCleanup?.status).toBe(SyncStatus.SYNCING);
    expect(beforeCleanup?.startedAt).not.toBeNull();

    // Run cleanup
    await clearAllSyncStatuses();

    // Verify it's now IDLE
    const afterCleanup = await getAccountSyncStatus(accountId);
    expect(afterCleanup?.status).toBe(SyncStatus.IDLE);
    expect(afterCleanup?.error).toBe('Sync interrupted by server restart');
    expect(afterCleanup?.startedAt).toBeNull();
  });

  it('should preserve COMPLETED status on startup', async () => {
    const accountId = 12347;

    // Set account to COMPLETED status
    await setAccountSyncStatus(accountId, SyncStatus.COMPLETED);

    // Get the completed status before cleanup
    const beforeCleanup = await getAccountSyncStatus(accountId);
    expect(beforeCleanup?.status).toBe(SyncStatus.COMPLETED);
    const completedAt = beforeCleanup?.completedAt;

    // Run cleanup
    await clearAllSyncStatuses();

    // Verify it's still COMPLETED
    const afterCleanup = await getAccountSyncStatus(accountId);
    expect(afterCleanup?.status).toBe(SyncStatus.COMPLETED);
    expect(afterCleanup?.completedAt).toBe(completedAt);
    expect(afterCleanup?.error).toBeNull();
  });

  it('should preserve FAILED status on startup', async () => {
    const accountId = 12348;
    const originalError = 'Original sync error';

    // Set account to FAILED status
    await setAccountSyncStatus(accountId, SyncStatus.FAILED, originalError);

    // Run cleanup
    await clearAllSyncStatuses();

    // Verify it's still FAILED with original error
    const afterCleanup = await getAccountSyncStatus(accountId);
    expect(afterCleanup?.status).toBe(SyncStatus.FAILED);
    expect(afterCleanup?.error).toBe(originalError);
    expect(afterCleanup?.completedAt).not.toBeNull();
  });

  it('should preserve IDLE status on startup', async () => {
    const accountId = 12349;

    // Set account to IDLE status
    await setAccountSyncStatus(accountId, SyncStatus.IDLE);

    // Run cleanup
    await clearAllSyncStatuses();

    // Verify it's still IDLE
    const afterCleanup = await getAccountSyncStatus(accountId);
    expect(afterCleanup?.status).toBe(SyncStatus.IDLE);
  });

  it('should handle multiple accounts with different statuses', async () => {
    const queuedAccountId = 11111;
    const syncingAccountId = 22222;
    const completedAccountId = 33333;
    const failedAccountId = 44444;

    // Set up various statuses
    await setAccountSyncStatus(queuedAccountId, SyncStatus.QUEUED);
    await setAccountSyncStatus(syncingAccountId, SyncStatus.SYNCING);
    await setAccountSyncStatus(completedAccountId, SyncStatus.COMPLETED);
    await setAccountSyncStatus(failedAccountId, SyncStatus.FAILED, 'Test error');

    // Run cleanup
    await clearAllSyncStatuses();

    // Verify results
    const queuedStatus = await getAccountSyncStatus(queuedAccountId);
    const syncingStatus = await getAccountSyncStatus(syncingAccountId);
    const completedStatus = await getAccountSyncStatus(completedAccountId);
    const failedStatus = await getAccountSyncStatus(failedAccountId);

    expect(queuedStatus?.status).toBe(SyncStatus.IDLE);
    expect(queuedStatus?.error).toBe('Sync interrupted by server restart');

    expect(syncingStatus?.status).toBe(SyncStatus.IDLE);
    expect(syncingStatus?.error).toBe('Sync interrupted by server restart');

    expect(completedStatus?.status).toBe(SyncStatus.COMPLETED);
    expect(completedStatus?.error).toBeNull();

    expect(failedStatus?.status).toBe(SyncStatus.FAILED);
    expect(failedStatus?.error).toBe('Test error');
  });

  it('should not touch userLastAutoSync keys', async () => {
    const userId = 99999;
    const timestamp = Date.now();

    // Set last auto sync
    await updateLastAutoSync(userId);

    // Run cleanup
    await clearAllSyncStatuses();

    // Verify the key still exists
    const lastSync = await redisClient.get(REDIS_KEYS.userLastAutoSync(userId));
    expect(lastSync).not.toBeNull();
    expect(parseInt(lastSync!, 10)).toBeGreaterThanOrEqual(timestamp);
  });

  it('should not touch accountPriority keys', async () => {
    const accountId = 88888;
    const priority = 100;

    // Set priority
    await setAccountPriority(accountId, priority);

    // Run cleanup
    await clearAllSyncStatuses();

    // Verify the key still exists
    const savedPriority = await redisClient.get(REDIS_KEYS.accountPriority(accountId));
    expect(savedPriority).not.toBeNull();
    expect(parseFloat(savedPriority!)).toBe(priority);
  });

  it('should delete invalid/corrupted keys', async () => {
    const corruptedKey = REDIS_KEYS.accountSyncStatus(77777);

    // Set corrupted data (not valid JSON)
    await redisClient.set(corruptedKey, 'invalid json data');

    // Run cleanup
    await clearAllSyncStatuses();

    // Verify the corrupted key was deleted
    const value = await redisClient.get(corruptedKey);
    expect(value).toBeNull();
  });
});
