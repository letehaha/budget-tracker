import { logger } from '@js/utils';
import { REDIS_KEY_PREFIX, redisClient } from '@root/redis-client';

/**
 * Check if Redis client is ready for operations
 * Prevents "The client is closed" errors during test teardown
 */
function isRedisReady(): boolean {
  return redisClient.status === 'ready';
}

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
  userLastAutoSync: (userId: number | string): string => `user:${userId}:last-auto-sync`,
  accountSyncStatus: (accountId: number | string): string => `account:${accountId}:sync-status`,
  accountPriority: (accountId: number | string): string => `account:${accountId}:priority`,
};

const AUTO_SYNC_PERIOD = 12 * 60 * 60 * 1000;
// 24 hours for prod, and about infinity for other envs to avoid unneeded syncs
const STATUS_TTL = (process.env.NODE_ENV === 'production' ? 24 : 3600) * 60 * 60;
const STALE_SYNC_THRESHOLD = 20 * 60 * 1000; // 15 minutes - if PENDING/SYNCING for longer, consider stale

/**
 * Check if auto-sync is needed based on last sync time
 */
export async function shouldTriggerAutoSync(userId: number): Promise<boolean> {
  if (!isRedisReady()) return true; // Default to allowing sync if Redis unavailable

  const lastSyncTime = await redisClient.get(REDIS_KEYS.userLastAutoSync(userId));

  if (!lastSyncTime) {
    return true; // No previous sync recorded
  }

  const lastSyncTimestamp = parseInt(lastSyncTime, 10);
  const timeSinceLastSync = Date.now() - lastSyncTimestamp;

  return timeSinceLastSync >= AUTO_SYNC_PERIOD;
}

/**
 * Update user's last auto-sync timestamp
 */
export async function updateLastAutoSync(userId: number): Promise<void> {
  if (!isRedisReady()) return;
  await redisClient.set(REDIS_KEYS.userLastAutoSync(userId), Date.now().toString());
}

/**
 * Get last auto-sync timestamp for user
 */
export async function getLastAutoSync(userId: number): Promise<number | null> {
  if (!isRedisReady()) return null;
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
  if (!isRedisReady()) return;

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

  // Re-check Redis connection after async operation (client may have closed during getAccountSyncStatus)
  if (!isRedisReady()) return;

  await redisClient.setex(REDIS_KEYS.accountSyncStatus(accountId), STATUS_TTL, JSON.stringify(statusData));
}

/**
 * Get sync status for an account
 * Automatically clears stale PENDING/SYNCING statuses
 */
export async function getAccountSyncStatus(accountId: number): Promise<AccountSyncStatus | null> {
  const defaultStatus: AccountSyncStatus = {
    accountId,
    status: SyncStatus.IDLE,
    startedAt: null,
    completedAt: null,
    error: null,
  };

  if (!isRedisReady()) return defaultStatus;

  const data = await redisClient.get(REDIS_KEYS.accountSyncStatus(accountId));

  if (!data) {
    return defaultStatus;
  }

  const status: AccountSyncStatus = JSON.parse(data);

  // Check if status is stale (PENDING/QUEUED/SYNCING for too long)
  if ((status.status === SyncStatus.QUEUED || status.status === SyncStatus.SYNCING) && status.startedAt) {
    const startedTime = new Date(status.startedAt).getTime();
    const elapsed = Date.now() - startedTime;

    if (elapsed > STALE_SYNC_THRESHOLD) {
      // Clear stale status and return IDLE
      logger.info(`Account ID:${accountId} was queued/syncing for too log. Status was reset.`);
      if (isRedisReady()) {
        await redisClient.del(REDIS_KEYS.accountSyncStatus(accountId));
      }
      return defaultStatus;
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
  if (!isRedisReady()) return;
  await redisClient.del(REDIS_KEYS.accountSyncStatus(accountId));
}

/**
 * Set priority score for an account (higher = more priority)
 */
export async function setAccountPriority(accountId: number, priority: number): Promise<void> {
  if (!isRedisReady()) return;
  await redisClient.setex(REDIS_KEYS.accountPriority(accountId), STATUS_TTL, priority.toString());
}

/**
 * Get priority score for an account
 */
export async function getAccountPriority(accountId: number): Promise<number> {
  if (!isRedisReady()) return 0;
  const priority = await redisClient.get(REDIS_KEYS.accountPriority(accountId));
  return priority ? parseFloat(priority) : 0;
}

/**
 * Clear stale sync statuses from Redis on startup
 * Only resets QUEUED/SYNCING statuses (which are invalid after restart)
 * Preserves COMPLETED/FAILED/IDLE statuses and user last-sync timestamps
 */
export async function clearAllSyncStatuses(): Promise<void> {
  if (!isRedisReady()) {
    logger.info('[Sync Status] Skipping cleanup - Redis not ready');
    return;
  }

  // Wrap into `*..*` wildcard just in case
  const accountStatusKeys = await redisClient.keys(`*${REDIS_KEYS.accountSyncStatus('*')}*`);

  let clearedCount = 0;
  let resetCount = 0;

  for (const rawKey of accountStatusKeys) {
    // Strip the keyPrefix from keys returned by keys() to avoid double-prefixing
    const key =
      REDIS_KEY_PREFIX && rawKey.startsWith(REDIS_KEY_PREFIX) ? rawKey.slice(REDIS_KEY_PREFIX!.length) : rawKey;
    // Check Redis connection before each operation to handle teardown gracefully
    if (!isRedisReady()) {
      logger.info('[Sync Status] Stopping cleanup - Redis connection closed');
      break;
    }

    try {
      const data = await redisClient.get(key);
      if (!data) continue;

      const status: AccountSyncStatus = JSON.parse(data);

      // Only reset statuses that indicate active syncing
      // These are invalid after a restart since the actual sync process is gone
      if (status.status === SyncStatus.QUEUED || status.status === SyncStatus.SYNCING) {
        // Reset to IDLE instead of deleting - preserves the key structure
        const resetStatus: AccountSyncStatus = {
          ...status,
          status: SyncStatus.IDLE,
          startedAt: null,
          completedAt: null,
          error: 'Sync interrupted by server restart',
        };

        if (isRedisReady()) {
          await redisClient.setex(key, STATUS_TTL, JSON.stringify(resetStatus));
          resetCount++;
        }
      }
      // Keep COMPLETED, FAILED, and IDLE statuses - they're still valid
    } catch (err) {
      // If we can't parse it, delete it (only if Redis is still ready)
      if (isRedisReady()) {
        await redisClient.del(key);
        clearedCount++;
      }
    }
  }

  if (resetCount > 0 || clearedCount > 0) {
    logger.info(
      `[Sync Status] Startup cleanup: reset ${resetCount} active syncs to IDLE, cleared ${clearedCount} invalid keys`,
    );
  }

  // Note: We DON'T touch userLastAutoSync or accountPriority keys
  // These are historical data and remain valid across restarts
}
