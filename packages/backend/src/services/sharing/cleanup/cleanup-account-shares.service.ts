import { RESOURCE_TYPES, SHARE_INVITATION_STATUSES, SharePermission } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import Users from '@models/users.model';
import { withTransaction } from '@services/common/with-transaction';

import { notifyShareOwnerAccountDeleted } from '../share-notifications';

export interface AccountShareCleanupResult {
  /** Recipients to notify post-commit. Captured before the share rows are deleted because
   *  the post-commit step has nothing to read otherwise. */
  recipients: Array<{
    sharedWithUserId: number;
    shareId: string;
    permission: SharePermission;
  }>;
  /** How many pending invitations were flipped to `revoked`. */
  revokedInvitationCount: number;
  /** How many `ResourceShares` rows were deleted. */
  deletedShareCount: number;
}

/**
 * Phase 1 of the account-deletion cleanup, intended to run inside the same transaction as
 * `Accounts.destroy(...)`. Revokes any pending invitations for the account, deletes the
 * `ResourceShares` rows (FK does not CASCADE because `resourceId` is a generic VARCHAR),
 * and returns the recipient set so phase 2 can notify them after commit.
 *
 * Two-phase shape mirrors `expire-invitations.service.ts` — the durable status flips run
 * in-tx, notifications happen post-commit so a transient notification failure can't roll
 * back a successful account delete.
 */
export const cleanupAccountSharesInTx = withTransaction(
  async ({
    accountId,
    ownerUserId,
  }: {
    accountId: number;
    ownerUserId: number;
  }): Promise<AccountShareCleanupResult> => {
    const resourceId = String(accountId);

    const shares = (await ResourceShares.findAll({
      where: { ownerUserId, resourceType: RESOURCE_TYPES.account, resourceId },
      attributes: ['id', 'sharedWithUserId', 'permission'],
      raw: true,
    })) as Array<{ id: string; sharedWithUserId: number; permission: SharePermission }>;

    const recipients = shares.map((s) => ({
      sharedWithUserId: s.sharedWithUserId,
      shareId: s.id,
      permission: s.permission,
    }));

    const deletedShareCount = await ResourceShares.destroy({
      where: { ownerUserId, resourceType: RESOURCE_TYPES.account, resourceId },
    });

    const [revokedInvitationCount] = await ShareInvitations.update(
      { status: SHARE_INVITATION_STATUSES.revoked, revokedAt: new Date() },
      {
        where: {
          ownerUserId,
          resourceType: RESOURCE_TYPES.account,
          resourceId,
          status: SHARE_INVITATION_STATUSES.pending,
        },
      },
    );

    return { recipients, revokedInvitationCount, deletedShareCount };
  },
);

/**
 * Phase 2 — best-effort post-commit notification fan-out. Each call is self-transactional
 * via `createNotification`, so a partial failure rolls back only the failing notification.
 * The per-recipient try/catch keeps a single bad row from blocking the rest of the batch.
 */
export const notifyAccountDeleteRecipients = async ({
  recipients,
  owner,
  account,
}: {
  recipients: AccountShareCleanupResult['recipients'];
  owner: Users | null;
  account: { id: number; name: string };
}): Promise<number> => {
  let notifiedCount = 0;
  for (const r of recipients) {
    try {
      await notifyShareOwnerAccountDeleted({
        recipientUserId: r.sharedWithUserId,
        owner,
        shareId: r.shareId,
        resource: { type: RESOURCE_TYPES.account, id: String(account.id), name: account.name },
        permission: r.permission,
      });
      notifiedCount += 1;
    } catch (error) {
      // Stable code so ops dashboards group these without depending on the dynamic msg.
      logger.error(
        {
          message: 'Failed to emit share_owner_account_deleted notification',
          error: error as Error,
        },
        {
          code: 'SHARE_OWNER_ACCOUNT_DELETED_NOTIFY_FAILED',
          shareId: r.shareId,
          recipientUserId: r.sharedWithUserId,
          accountId: account.id,
        },
      );
    }
  }
  return notifiedCount;
};
