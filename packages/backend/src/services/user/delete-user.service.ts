import { RESOURCE_TYPES, SharePermission, TransactionCreatorSnapshot } from '@bt/shared/types';
import { authPool } from '@config/auth';
import { CacheClient } from '@js/utils/cache';
import { logger } from '@js/utils/logger';
import * as Accounts from '@models/accounts.model';
import ResourceShares from '@models/resource-shares.model';
import Transactions from '@models/transactions.model';
import * as Users from '@models/users.model';
import { Op } from 'sequelize';

import { transactionSyncQueue } from '../bank-data-providers/monobank/transaction-sync-queue';
import { REDIS_KEYS as SYNC_REDIS_KEYS, clearAccountSyncStatus } from '../bank-data-providers/sync/sync-status-tracker';
import { withTransaction } from '../common/with-transaction';
import { notifyShareOwnerAccountDeleted } from '../sharing/share-notifications';

/**
 * Snapshotted ahead of the destroy so post-commit notifications have everything they need
 * after FK cascades wipe the underlying `ResourceShares` and `Accounts` rows. Captured
 * inside the transaction; consumed outside so a notify failure can't abort the destroy.
 */
interface AccountDeleteNotificationTarget {
  recipientUserId: number;
  shareId: string;
  resourceId: string;
  resourceName: string;
  permission: SharePermission;
}

interface DeleteUserInTxResult {
  /** Targets to notify after commit. Empty array when the user had no shared accounts. */
  notificationTargets: AccountDeleteNotificationTarget[];
  /** Captured before destroy so the post-commit step can build the `owner` snapshot
   *  without the Users row that the destroy is about to remove. */
  ownerSnapshot: { id: number; username: string; avatar: string | null } | null;
  authUserId: string | null;
}

const deleteUserInTx = withTransaction(async ({ userId }: { userId: number }): Promise<DeleteUserInTxResult> => {
  const user = await Users.default.findByPk(userId);
  if (!user) {
    return { notificationTargets: [], ownerSnapshot: null, authUserId: null };
  }

  const notificationTargets = await collectAccountDeleteNotificationTargets({ deletingUser: user });
  await stampCreatorSnapshotForOutboundTransactions({ deletingUser: user });

  // Snapshot owner identity BEFORE the destroy — the row is gone after this line.
  const ownerSnapshot = {
    id: user.id,
    username: user.username,
    avatar: user.avatar ?? null,
  };
  const authUserId = user.authUserId ?? null;

  await Users.default.destroy({ where: { id: userId } });

  return { notificationTargets, ownerSnapshot, authUserId };
});

export const deleteUser = async ({ userId }: { userId: number }) => {
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

    // 3. Family-sharing snapshot + creator-snapshot stamp + Users destroy, all inside a
    //    single transaction so a stamp/destroy failure rolls back atomically. The
    //    sharing notifications are intentionally NOT in here — emitting them mid-tx
    //    would either roll back the user-delete on a transient notification failure or,
    //    worse, leave the tx in an aborted state where the next statement throws
    //    "current transaction is aborted, commands ignored until end of transaction block".
    const { notificationTargets, ownerSnapshot, authUserId } = await deleteUserInTx({ userId });

    // 4. Delete user from better-auth tables (ba_user cascades to ba_session, ba_account,
    //    ba_passkey, etc.). Separate connection pool — does not roll back the app DB.
    if (authUserId) {
      try {
        await authPool.query('DELETE FROM ba_user WHERE id = $1', [authUserId]);
        logger.info(`Deleted better-auth user ${authUserId} for app user ${userId}`);
      } catch (authError) {
        // Log but don't fail - the app user is already deleted
        logger.error({ message: 'Failed to delete better-auth user', error: authError as Error });
      }
    }

    // 5. Post-commit fan-out: emit `share_owner_account_deleted` notifications to every
    //    recipient of an account this user had shared. Per-recipient try/catch keeps a
    //    single bad row from blocking the rest of the batch; the user-delete has already
    //    committed, so a failed notification is a recoverable best-effort signal.
    if (notificationTargets.length > 0 && ownerSnapshot) {
      await fanOutAccountDeleteNotifications({ targets: notificationTargets, ownerSnapshot });
    }
  } catch (e) {
    logger.error({ message: 'User deletion failed', error: e as Error }, { code: 'USER_DELETE_FAILED', userId });
    throw e;
  }
};

/**
 * Reads the live `ResourceShares` rows + `Accounts` names while the user still exists.
 * The returned snapshots are consumed post-commit, by which time those rows are gone
 * thanks to the FK cascade — the snapshot is the only durable record of who needs
 * notifying.
 */
async function collectAccountDeleteNotificationTargets({
  deletingUser,
}: {
  deletingUser: Users.default;
}): Promise<AccountDeleteNotificationTarget[]> {
  const shares = (await ResourceShares.findAll({
    where: { ownerUserId: deletingUser.id, resourceType: RESOURCE_TYPES.account },
    attributes: ['id', 'sharedWithUserId', 'resourceId', 'permission'],
    raw: true,
  })) as Array<{ id: string; sharedWithUserId: number; resourceId: string; permission: SharePermission }>;

  if (shares.length === 0) return [];

  const accountIds = [...new Set(shares.map((s) => Number(s.resourceId)).filter(Number.isInteger))];
  const accountRows = (await Accounts.default.findAll({
    where: { id: { [Op.in]: accountIds } },
    attributes: ['id', 'name'],
    raw: true,
  })) as Array<{ id: number; name: string }>;
  const namesById = new Map(accountRows.map((a) => [a.id, a.name]));

  return shares.map((share) => ({
    recipientUserId: share.sharedWithUserId,
    shareId: share.id,
    resourceId: share.resourceId,
    resourceName: namesById.get(Number(share.resourceId)) ?? 'Shared account',
    permission: share.permission,
  }));
}

/**
 * Best-effort post-commit fan-out. Each call is self-transactional via
 * `createNotification`; a failure on one recipient is logged with a stable code and
 * doesn't block the rest of the batch.
 */
async function fanOutAccountDeleteNotifications({
  targets,
  ownerSnapshot,
}: {
  targets: AccountDeleteNotificationTarget[];
  ownerSnapshot: { id: number; username: string; avatar: string | null };
}) {
  // `notifyShareOwnerAccountDeleted` expects a `Users` instance for snapshotting, but
  // the row is already gone post-destroy. Wrap the snapshot in the minimal shape the
  // notification helper reads — only `id`, `username`, `avatar` are touched.
  const ownerLike = ownerSnapshot as unknown as Users.default;

  for (const target of targets) {
    try {
      await notifyShareOwnerAccountDeleted({
        recipientUserId: target.recipientUserId,
        owner: ownerLike,
        shareId: target.shareId,
        resource: { type: RESOURCE_TYPES.account, id: target.resourceId, name: target.resourceName },
        permission: target.permission,
      });
    } catch (error) {
      logger.error(
        {
          message: 'Failed to emit share_owner_account_deleted notification during user-delete cascade',
          error: error as Error,
        },
        {
          code: 'SHARE_OWNER_ACCOUNT_DELETED_NOTIFY_FAILED_USER_CASCADE',
          shareId: target.shareId,
          recipientUserId: target.recipientUserId,
          ownerUserId: ownerSnapshot.id,
        },
      );
    }
  }
}

/**
 * Stamps `creatorSnapshot` on transactions the deleting user created on accounts owned by
 * someone else (i.e. transactions on shared accounts the user has access to). After the
 * Users destroy, the FK on `Transactions.userId` is `ON DELETE SET NULL`, which would
 * otherwise leave the row anonymous; the snapshot lets the frontend keep rendering the
 * original creator name with a "(deleted)" indicator on the still-existing tx row.
 *
 * Bounded to accounts the user actually has share access to, which is typically a small
 * set, instead of scanning the global Accounts table.
 */
async function stampCreatorSnapshotForOutboundTransactions({ deletingUser }: { deletingUser: Users.default }) {
  const sharedAccountRows = (await ResourceShares.findAll({
    where: { sharedWithUserId: deletingUser.id, resourceType: RESOURCE_TYPES.account },
    attributes: ['resourceId'],
    raw: true,
  })) as Array<{ resourceId: string }>;

  const accessibleAccountIds = sharedAccountRows
    .map((s) => Number(s.resourceId))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (accessibleAccountIds.length === 0) return;

  const snapshot: TransactionCreatorSnapshot = {
    userId: deletingUser.id,
    username: deletingUser.username,
    avatar: deletingUser.avatar ?? null,
  };

  await Transactions.update(
    { creatorSnapshot: snapshot },
    {
      where: {
        userId: deletingUser.id,
        accountId: { [Op.in]: accessibleAccountIds },
      },
    },
  );
}
