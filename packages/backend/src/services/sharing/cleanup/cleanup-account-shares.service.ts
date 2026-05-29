import { RESOURCE_TYPES, SHARE_INVITATION_STATUSES, SharePermission, RecordId } from '@bt/shared/types';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import Users from '@models/users.model';
import { Op } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';

import { fanOutNotifications } from '../fan-out-notifications';
import { notifyHouseholdOwnerAccountDeleted, notifyShareOwnerAccountDeleted } from '../share-notifications';

export interface AccountShareCleanupResult {
  /** Per-resource share recipients to notify post-commit. Captured before the share rows
   *  are deleted because the post-commit step has nothing to read otherwise. */
  recipients: Array<{
    sharedWithUserId: number;
    shareId: RecordId;
    permission: SharePermission;
  }>;
  /**
   * Household-membership recipients of the same owner. The household rows themselves
   * survive (the membership still grants access to the owner's *other* accounts) — we
   * only fan out a "this specific account was deleted" notification so each member can
   * drop their cached state for the gone resource.
   */
  householdRecipients: Array<{
    sharedWithUserId: number;
    shareId: RecordId;
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
    accountId: string;
    ownerUserId: number;
  }): Promise<AccountShareCleanupResult> => {
    const resourceId = accountId;

    const [shares, householdShares] = await Promise.all([
      ResourceShares.findAll({
        where: { ownerUserId, resourceType: RESOURCE_TYPES.account, resourceId },
        attributes: ['id', 'sharedWithUserId', 'permission'],
        raw: true,
      }) as unknown as Promise<Array<{ id: RecordId; sharedWithUserId: number; permission: SharePermission }>>,
      // Household memberships of the same owner survive the account delete — pull the
      // accepted ones so we can notify those members that one of the household-shared
      // accounts is gone.
      ResourceShares.findAll({
        where: {
          ownerUserId,
          resourceType: RESOURCE_TYPES.household,
          resourceId: String(ownerUserId),
          acceptedAt: { [Op.not]: null },
        },
        attributes: ['id', 'sharedWithUserId'],
        raw: true,
      }) as unknown as Promise<Array<{ id: RecordId; sharedWithUserId: number }>>,
    ]);

    const recipients = shares.map((s) => ({
      sharedWithUserId: s.sharedWithUserId,
      shareId: s.id,
      permission: s.permission,
    }));

    const householdRecipients = householdShares.map((s) => ({
      sharedWithUserId: s.sharedWithUserId,
      shareId: s.id,
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

    return { recipients, householdRecipients, revokedInvitationCount, deletedShareCount };
  },
);

/**
 * Phase 2 — best-effort post-commit notification fan-out. Each call is self-transactional
 * via `createNotification`, so a partial failure rolls back only the failing notification.
 * The per-recipient try/catch keeps a single bad row from blocking the rest of the batch.
 */
export const notifyAccountDeleteRecipients = async ({
  recipients,
  householdRecipients,
  owner,
  account,
}: {
  recipients: AccountShareCleanupResult['recipients'];
  householdRecipients: AccountShareCleanupResult['householdRecipients'];
  owner: Users | null;
  account: { id: string; name: string };
}): Promise<number> => {
  const resource = { type: RESOURCE_TYPES.account, id: account.id, name: account.name } as const;
  const perResourceNotified = await fanOutNotifications({
    targets: recipients,
    notify: (r) =>
      notifyShareOwnerAccountDeleted({
        recipientUserId: r.sharedWithUserId,
        owner,
        shareId: r.shareId,
        resource,
        permission: r.permission,
      }),
    errorCode: 'SHARE_OWNER_ACCOUNT_DELETED_NOTIFY_FAILED',
    errorMessage: 'Failed to emit share_owner_account_deleted notification',
    buildLogContext: (r) => ({
      shareId: r.shareId,
      recipientUserId: r.sharedWithUserId,
      accountId: account.id,
    }),
  });
  const householdNotified = await fanOutNotifications({
    targets: householdRecipients,
    notify: (r) =>
      notifyHouseholdOwnerAccountDeleted({
        recipientUserId: r.sharedWithUserId,
        owner,
        shareId: r.shareId,
        resource,
      }),
    errorCode: 'HOUSEHOLD_OWNER_ACCOUNT_DELETED_NOTIFY_FAILED',
    errorMessage: 'Failed to emit household_owner_account_deleted notification',
    buildLogContext: (r) => ({
      shareId: r.shareId,
      recipientUserId: r.sharedWithUserId,
      accountId: account.id,
    }),
  });
  return perResourceNotified + householdNotified;
};
