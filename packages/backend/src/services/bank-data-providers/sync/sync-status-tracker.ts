import { redisKeyFormatter } from '@common/lib/redis';
import { logger } from '@js/utils';
import { redisClient } from '@root/redis-client';

export enum SyncStatus {
  IDLE = 'idle',
  QUEUED = 'queued', // For Monobank jobs waiting in BullMQ queue
  SYNCING = 'syncing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface AccountSyncStatus {
  accountId: number;
  status: SyncStatus;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export const REDIS_KEYS = {
  userLastAutoSync: (userId: number): string => redisKeyFormatter(`user:${userId}:last-auto-sync`),
  accountSyncStatus: (accountId: number): string => redisKeyFormatter(`account:${accountId}:sync-status`),
  accountPriority: (accountId: number): string => redisKeyFormatter(`account:${accountId}:priority`),
};

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const STATUS_TTL = 24 * 60 * 60; // 24 hours in seconds
const STALE_SYNC_THRESHOLD = 20 * 60 * 1000; // 15 minutes - if PENDING/SYNCING for longer, consider stale

/**
 * Check if auto-sync is needed based on last sync time
 */
export async function shouldTriggerAutoSync(userId: number): Promise<boolean> {
  const lastSyncTime = await redisClient.get(REDIS_KEYS.userLastAutoSync(userId));

  if (!lastSyncTime) {
    return true; // No previous sync recorded
  }

  const lastSyncTimestamp = parseInt(lastSyncTime, 10);
  const timeSinceLastSync = Date.now() - lastSyncTimestamp;

  return timeSinceLastSync >= FOUR_HOURS_MS;
}

/**
 * Update user's last auto-sync timestamp
 */
export async function updateLastAutoSync(userId: number): Promise<void> {
  await redisClient.set(REDIS_KEYS.userLastAutoSync(userId), Date.now().toString());
}

/**
 * Get last auto-sync timestamp for user
 */
export async function getLastAutoSync(userId: number): Promise<number | null> {
  const lastSyncTime = await redisClient.get(REDIS_KEYS.userLastAutoSync(userId));
  return lastSyncTime ? parseInt(lastSyncTime, 10) : null;
}

/**
 * Set sync status for an account
 */
export async function setAccountSyncStatus(
  accountId: number,
  status: SyncStatus,
  error: string | null = null,
): Promise<void> {
  const statusData: AccountSyncStatus = {
    accountId,
    status,
    startedAt: status === SyncStatus.SYNCING ? new Date().toISOString() : null,
    completedAt: [SyncStatus.COMPLETED, SyncStatus.FAILED].includes(status) ? new Date().toISOString() : null,
    error,
  };

  // Get existing data to preserve startedAt
  const existing = await getAccountSyncStatus(accountId);
  if (existing?.startedAt && status !== SyncStatus.SYNCING) {
    statusData.startedAt = existing.startedAt;
  }

  await redisClient.setEx(REDIS_KEYS.accountSyncStatus(accountId), STATUS_TTL, JSON.stringify(statusData));
}

/**
 * Get sync status for an account
 * Automatically clears stale PENDING/SYNCING statuses
 */
export async function getAccountSyncStatus(accountId: number): Promise<AccountSyncStatus | null> {
  const data = await redisClient.get(REDIS_KEYS.accountSyncStatus(accountId));

  if (!data) {
    return {
      accountId,
      status: SyncStatus.IDLE,
      startedAt: null,
      completedAt: null,
      error: null,
    };
  }

  const status: AccountSyncStatus = JSON.parse(data);

  // Check if status is stale (PENDING/QUEUED/SYNCING for too long)
  if ((status.status === SyncStatus.QUEUED || status.status === SyncStatus.SYNCING) && status.startedAt) {
    const startedTime = new Date(status.startedAt).getTime();
    const elapsed = Date.now() - startedTime;

    if (elapsed > STALE_SYNC_THRESHOLD) {
      // Clear stale status and return IDLE
      logger.info(`Account ID:${accountId} was queued/syncing for too log. Status was reset.`);
      await redisClient.del(REDIS_KEYS.accountSyncStatus(accountId));
      return {
        accountId,
        status: SyncStatus.IDLE,
        startedAt: null,
        completedAt: null,
        error: null,
      };
    }
  }

  return status;
}

/**
 * Get sync status for multiple accounts
 */
export async function getMultipleAccountsSyncStatus(accountIds: number[]): Promise<AccountSyncStatus[]> {
  const statuses = await Promise.all(accountIds.map((id) => getAccountSyncStatus(id)));

  return statuses.filter((s): s is AccountSyncStatus => s !== null);
}

/**
 * Clear sync status for an account
 */
export async function clearAccountSyncStatus(accountId: number): Promise<void> {
  await redisClient.del(REDIS_KEYS.accountSyncStatus(accountId));
}

/**
 * Set priority score for an account (higher = more priority)
 */
export async function setAccountPriority(accountId: number, priority: number): Promise<void> {
  await redisClient.setEx(REDIS_KEYS.accountPriority(accountId), STATUS_TTL, priority.toString());
}

/**
 * Get priority score for an account
 */
export async function getAccountPriority(accountId: number): Promise<number> {
  const priority = await redisClient.get(REDIS_KEYS.accountPriority(accountId));
  return priority ? parseFloat(priority) : 0;
}

/**
 * Clear all sync-related statuses from Redis
 * Should be called on application startup to clean up stale states
 */
export async function clearAllSyncStatuses(): Promise<void> {
  // Use wildcards to match keys with or without Jest worker prefix
  const accountStatusPattern = '*account:*:sync-status*';
  const userSyncPattern = '*user:*:last-auto-sync*';

  const accountStatusKeys = await redisClient.keys(accountStatusPattern);
  const userSyncKeys = await redisClient.keys(userSyncPattern);
  const allKeys = [...accountStatusKeys, ...userSyncKeys];

  if (allKeys.length > 0) {
    await redisClient.del(allKeys);
    logger.info(`[Sync Status] Cleared ${allKeys.length} stale sync status keys on startup`);
  }
}
