import { authPool } from '@config/auth';
import { CacheClient } from '@js/utils/cache';
import { logger } from '@js/utils/logger';
import * as Accounts from '@models/Accounts.model';
import * as Users from '@models/Users.model';

import { transactionSyncQueue } from '../bank-data-providers/monobank/transaction-sync-queue';
import { REDIS_KEYS as SYNC_REDIS_KEYS, clearAccountSyncStatus } from '../bank-data-providers/sync/sync-status-tracker';
import { withTransaction } from '../common/with-transaction';

export const deleteUser = withTransaction(async ({ userId }: { userId: number }) => {
  try {
    // 1. Clean up BullMQ queue - remove pending sync jobs for this user
    // Only target 'waiting' and 'delayed' jobs - 'active' jobs are locked by workers and cannot be removed
    const pendingJobs = await transactionSyncQueue.getJobs(['waiting', 'delayed']);
    const userJobs = pendingJobs.filter((job) => job.data.userId === userId);
    await Promise.all(
      userJobs.map((job) =>
        job.remove().catch(() => {
          // Job may have become active between getJobs and remove - ignore lock errors
          logger.warn(`Could not remove job during user deletion. jobId: ${job.id}`);
        }),
      ),
    );

    // 2. Clean up Redis cache
    const cache = new CacheClient({ logPrefix: 'user-deletion' });

    // Clear ref_amount cache for this user
    await cache.delete(`ref_amount:${userId}:*`, true);

    // Clear user's last auto-sync timestamp
    await cache.delete(SYNC_REDIS_KEYS.userLastAutoSync(userId));

    // Clear sync status for all user's accounts
    const accounts = await Accounts.default.findAll({
      where: { userId },
      attributes: ['id'],
      raw: true,
    });
    await Promise.all(accounts.map((account) => clearAccountSyncStatus(account.id)));

    // 3. Get user's authUserId before deleting
    const user = await Users.default.findByPk(userId, {
      attributes: ['authUserId'],
      raw: true,
    });

    // 4. Delete user from app database - all related data is automatically deleted via ON DELETE CASCADE
    await Users.default.destroy({ where: { id: userId } });

    // 5. Delete user from better-auth tables (ba_user and related tables via CASCADE)
    if (user?.authUserId) {
      try {
        // Delete from ba_user - this will cascade to ba_session, ba_account, ba_passkey, etc.
        await authPool.query('DELETE FROM ba_user WHERE id = $1', [user.authUserId]);
        logger.info(`Deleted better-auth user ${user.authUserId} for app user ${userId}`);
      } catch (authError) {
        // Log but don't fail - the app user is already deleted
        logger.error({ message: 'Failed to delete better-auth user', error: authError as Error });
      }
    }
  } catch (e) {
    console.error(e);
    throw e;
  }
});
