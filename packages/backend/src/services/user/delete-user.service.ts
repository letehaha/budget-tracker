import {
  HouseholdSharePermission,
  RESOURCE_TYPES,
  SharePermission,
  TransactionCreatorSnapshot,
} from '@bt/shared/types';
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
import { fanOutNotifications } from '../sharing/fan-out-notifications';
import { convertCrossUserTransfersForAccountIds } from '../sharing/household/convert-cross-user-transfers.service';
import {
  notifyHouseholdMemberAccountDeleted,
  notifyHouseholdRevoked,
  notifyShareOwnerAccountDeleted,
} from '../sharing/share-notifications';
import { formatHouseholdLabel, toPositiveInt } from '../sharing/sharing-utils';

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

interface HouseholdRevokedTarget {
  /** Member who loses access (recipient of the household share). */
  recipientUserId: number;
  shareId: string;
  permission: HouseholdSharePermission;
}

interface HouseholdOwnerNotifyTarget {
  /** Owner who gets notified that one of their household members is gone. */
  ownerUserId: number;
  shareId: string;
}

interface DeleteUserInTxResult {
  /** Targets to notify after commit. Empty array when the user had no shared accounts. */
  notificationTargets: AccountDeleteNotificationTarget[];
  /**
   * Households the deleting user OWNED. After the user row destroys, FK cascades will
   * drop the household ResourceShares rows — these members lose access. Captured in
   * advance so the post-commit step can still address them.
   */
  householdRevokedTargets: HouseholdRevokedTarget[];
  /**
   * Households the deleting user was a MEMBER of. The household keeps existing for the
   * remaining members; we notify the owner that this specific member is now gone.
   */
  householdOwnerNotifyTargets: HouseholdOwnerNotifyTarget[];
  /** Captured before destroy so the post-commit step can build the `owner` snapshot
   *  without the Users row that the destroy is about to remove. */
  ownerSnapshot: { id: number; username: string; avatar: string | null } | null;
  authUserId: string | null;
}

const deleteUserInTx = withTransaction(async ({ userId }: { userId: number }): Promise<DeleteUserInTxResult> => {
  const user = await Users.default.findByPk(userId);
  if (!user) {
    return {
      notificationTargets: [],
      householdRevokedTargets: [],
      householdOwnerNotifyTargets: [],
      ownerSnapshot: null,
      authUserId: null,
    };
  }

  const [notificationTargets, householdRevokedTargets, householdOwnerNotifyTargets] = await Promise.all([
    collectAccountDeleteNotificationTargets({ deletingUser: user }),
    collectHouseholdRevokedTargets({ deletingUser: user }),
    collectHouseholdOwnerNotifyTargets({ deletingUser: user }),
  ]);
  await stampCreatorSnapshotForOutboundTransactions({ deletingUser: user });

  // Convert cross-user transfer pairs BEFORE the destroy. Without this, the deleting
  // user's accounts cascade-delete their legs, while the partner leg on someone else's
  // account survives with `transferId` pointing at the now-gone partner — orphan
  // half-transfer that the UI can't render coherently. Loaded inside the transaction
  // so the leg/account reads see the soon-to-be-destroyed rows.
  const userOwnedAccountRows = (await Accounts.default.findAll({
    where: { userId },
    attributes: ['id'],
    raw: true,
  })) as Array<{ id: string }>;
  await convertCrossUserTransfersForAccountIds({
    accountIds: userOwnedAccountRows.map((row) => row.id),
    ownerUserId: userId,
  });

  // Snapshot owner identity BEFORE the destroy — the row is gone after this line.
  const ownerSnapshot = {
    id: user.id,
    username: user.username,
    avatar: user.avatar ?? null,
  };
  const authUserId = user.authUserId ?? null;

  await Users.default.destroy({ where: { id: userId } });

  return {
    notificationTargets,
    householdRevokedTargets,
    householdOwnerNotifyTargets,
    ownerSnapshot,
    authUserId,
  };
});

export const deleteUser = async ({ userId }: { userId: number }) => {
  try {
    // 1. Clean up BullMQ queue - remove pending sync jobs for this user
    // Only target 'waiting' and 'delayed' jobs - 'active' jobs are locked by workers and cannot be removed
    const pendingJobs = await transactionSyncQueue.getJobs(['waiting', 'delayed']);
    const userJobs = pendingJobs.filter((job) => job.data.userId === userId);
    await Promise.all(
      userJobs.map((job) =>
        job.remove().catch((error) => {
          // Job may have become active between getJobs and remove - ignore lock errors,
          // but log the actual error so we can spot non-lock failures (Redis disconnect,
          // etc.) instead of misattributing every miss to a transient lock race.
          logger.warn(`Could not remove job during user deletion. jobId: ${job.id}`, { error: error as Error });
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
    const { notificationTargets, householdRevokedTargets, householdOwnerNotifyTargets, ownerSnapshot, authUserId } =
      await deleteUserInTx({ userId });

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
    if (householdRevokedTargets.length > 0 && ownerSnapshot) {
      await fanOutHouseholdRevokedNotifications({ targets: householdRevokedTargets, ownerSnapshot });
    }
    if (householdOwnerNotifyTargets.length > 0 && ownerSnapshot) {
      await fanOutHouseholdMemberDeletedNotifications({
        targets: householdOwnerNotifyTargets,
        memberSnapshot: ownerSnapshot,
      });
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

  const accountIds = [...new Set(shares.map((s) => s.resourceId))];
  const accountRows = (await Accounts.default.findAll({
    where: { id: { [Op.in]: accountIds } },
    attributes: ['id', 'name'],
    raw: true,
  })) as Array<{ id: string; name: string }>;
  const namesById = new Map(accountRows.map((a) => [a.id, a.name]));

  return shares.map((share) => ({
    recipientUserId: share.sharedWithUserId,
    shareId: share.id,
    resourceId: share.resourceId,
    resourceName: namesById.get(share.resourceId) ?? 'Shared account',
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
  await fanOutNotifications({
    targets,
    notify: (target) =>
      notifyShareOwnerAccountDeleted({
        recipientUserId: target.recipientUserId,
        owner: ownerLike,
        shareId: target.shareId,
        resource: { type: RESOURCE_TYPES.account, id: target.resourceId, name: target.resourceName },
        permission: target.permission,
      }),
    errorCode: 'SHARE_OWNER_ACCOUNT_DELETED_NOTIFY_FAILED_USER_CASCADE',
    errorMessage: 'Failed to emit share_owner_account_deleted notification during user-delete cascade',
    buildLogContext: (target) => ({
      shareId: target.shareId,
      recipientUserId: target.recipientUserId,
      ownerUserId: ownerSnapshot.id,
    }),
  });
}

/**
 * Pulls household memberships where the deleting user is the OWNER. Each accepted row
 * means a member who is about to lose household-derived access when the FK cascade drops
 * the row. Snapshot in advance because we won't be able to read the rows post-commit.
 */
async function collectHouseholdRevokedTargets({
  deletingUser,
}: {
  deletingUser: Users.default;
}): Promise<HouseholdRevokedTarget[]> {
  const rows = (await ResourceShares.findAll({
    where: {
      ownerUserId: deletingUser.id,
      resourceType: RESOURCE_TYPES.household,
      acceptedAt: { [Op.not]: null },
    },
    attributes: ['id', 'sharedWithUserId', 'permission'],
    raw: true,
  })) as Array<{ id: string; sharedWithUserId: number; permission: HouseholdSharePermission }>;

  return rows.map((row) => ({
    recipientUserId: row.sharedWithUserId,
    shareId: row.id,
    permission: row.permission,
  }));
}

/**
 * Pulls household memberships where the deleting user is the MEMBER (sharedWithUserId).
 * The household keeps existing for the rest; the owner gets notified that this specific
 * member is no longer in their household.
 */
async function collectHouseholdOwnerNotifyTargets({
  deletingUser,
}: {
  deletingUser: Users.default;
}): Promise<HouseholdOwnerNotifyTarget[]> {
  const rows = (await ResourceShares.findAll({
    where: {
      sharedWithUserId: deletingUser.id,
      resourceType: RESOURCE_TYPES.household,
      acceptedAt: { [Op.not]: null },
    },
    attributes: ['id', 'ownerUserId'],
    raw: true,
  })) as Array<{ id: string; ownerUserId: number }>;

  return rows.map((row) => ({
    ownerUserId: row.ownerUserId,
    shareId: row.id,
  }));
}

/** Fan-out for owner-deleted households. */
async function fanOutHouseholdRevokedNotifications({
  targets,
  ownerSnapshot,
}: {
  targets: HouseholdRevokedTarget[];
  ownerSnapshot: { id: number; username: string; avatar: string | null };
}) {
  const ownerLike = ownerSnapshot as unknown as Users.default;
  const resource = {
    type: RESOURCE_TYPES.household,
    id: String(ownerSnapshot.id),
    name: formatHouseholdLabel(ownerSnapshot.username),
  } as const;
  await fanOutNotifications({
    targets,
    notify: (target) =>
      notifyHouseholdRevoked({
        recipientUserId: target.recipientUserId,
        owner: ownerLike,
        shareId: target.shareId,
        resource,
        permission: target.permission,
      }),
    errorCode: 'HOUSEHOLD_REVOKED_NOTIFY_FAILED_USER_CASCADE',
    errorMessage: 'Failed to emit household_revoked notification during owner-delete cascade',
    buildLogContext: (target) => ({
      shareId: target.shareId,
      recipientUserId: target.recipientUserId,
      ownerUserId: ownerSnapshot.id,
    }),
  });
}

/** Fan-out for member-deleted households (the owner side). */
async function fanOutHouseholdMemberDeletedNotifications({
  targets,
  memberSnapshot,
}: {
  targets: HouseholdOwnerNotifyTarget[];
  memberSnapshot: { id: number; username: string; avatar: string | null };
}) {
  await fanOutNotifications({
    targets,
    notify: (target) =>
      notifyHouseholdMemberAccountDeleted({
        ownerUserId: target.ownerUserId,
        memberSnapshot,
        shareId: target.shareId,
        resource: {
          type: RESOURCE_TYPES.household,
          id: String(target.ownerUserId),
          name: 'your household',
        },
      }),
    errorCode: 'HOUSEHOLD_MEMBER_ACCOUNT_DELETED_NOTIFY_FAILED_USER_CASCADE',
    errorMessage: 'Failed to emit household_member_account_deleted notification during member-delete cascade',
    buildLogContext: (target) => ({
      shareId: target.shareId,
      ownerUserId: target.ownerUserId,
      memberUserId: memberSnapshot.id,
    }),
  });
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
  // Two paths into someone else's account:
  //   1. Per-resource share — `ResourceShares{type:account, resourceId:<accountId>}`
  //   2. Household membership — `ResourceShares{type:household, resourceId:<ownerUserId>}`
  //      grants write access to every account the granting user owns.
  // Both must contribute or household-derived txns end up anonymous after the destroy.
  const [perResourceRows, householdRows] = await Promise.all([
    ResourceShares.findAll({
      where: { sharedWithUserId: deletingUser.id, resourceType: RESOURCE_TYPES.account },
      attributes: ['resourceId'],
      raw: true,
    }) as unknown as Promise<Array<{ resourceId: string }>>,
    ResourceShares.findAll({
      where: {
        sharedWithUserId: deletingUser.id,
        resourceType: RESOURCE_TYPES.household,
        acceptedAt: { [Op.not]: null },
      },
      attributes: ['resourceId'],
      raw: true,
    }) as unknown as Promise<Array<{ resourceId: string }>>,
  ]);

  // Per-resource account shares: resourceId is a UUID account ID (string).
  const accessibleAccountIds = new Set<string>();
  for (const row of perResourceRows) {
    if (row.resourceId) accessibleAccountIds.add(row.resourceId);
  }

  // Household shares: resourceId is the granting user's integer userId stored as a string.
  const householdGrantorIds = householdRows
    .map((row) => toPositiveInt(row.resourceId))
    .filter((id): id is number => id !== null);
  if (householdGrantorIds.length > 0) {
    const grantorAccounts = (await Accounts.default.findAll({
      where: { userId: { [Op.in]: householdGrantorIds } },
      attributes: ['id'],
      raw: true,
    })) as Array<{ id: string }>;
    for (const account of grantorAccounts) accessibleAccountIds.add(account.id);
  }

  if (accessibleAccountIds.size === 0) return;

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
        accountId: { [Op.in]: Array.from(accessibleAccountIds) },
      },
    },
  );
}
