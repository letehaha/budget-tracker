import { CacheClient } from '@js/utils/cache';
import * as Accounts from '@models/Accounts.model';
import * as Users from '@models/Users.model';

import { transactionSyncQueue } from '../bank-data-providers/monobank/transaction-sync-queue';
import { REDIS_KEYS as SYNC_REDIS_KEYS, clearAccountSyncStatus } from '../bank-data-providers/sync/sync-status-tracker';
import { withTransaction } from '../common/with-transaction';

export const deleteUser = withTransaction(async ({ userId }: { userId: number }) => {
  try {
    // 1. Clean up BullMQ queue - remove pending sync jobs for this user
    const pendingJobs = await transactionSyncQueue.getJobs(['waiting', 'active', 'delayed']);
    const userJobs = pendingJobs.filter((job) => job.data.userId === userId);
    await Promise.all(userJobs.map((job) => job.remove()));

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

    // 3. Delete user - all related data is automatically deleted via ON DELETE CASCADE
    await Users.default.destroy({ where: { id: userId } });
  } catch (e) {
    console.error(e);
    throw e;
  }
});
