import { RESOURCE_TYPES, RecordId, SHARE_INVITATION_STATUSES, SharePermission } from '@bt/shared/types';
import BudgetTransactions from '@models/budget-transactions.model';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import Users from '@models/users.model';
import { Op, fn, where, literal } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';

import { fanOutNotifications } from '../fan-out-notifications';
import { notifyShareOwnerBudgetDeleted } from '../share-notifications';

export interface BudgetShareCleanupResult {
  /** Per-resource share recipients to notify post-commit. Captured before the share rows
   *  are deleted so the post-commit step has something to fan out against. */
  recipients: Array<{
    sharedWithUserId: number;
    shareId: RecordId;
    permission: SharePermission;
  }>;
  /** How many pending invitations were flipped to `revoked`. */
  revokedInvitationCount: number;
  /** How many `ResourceShares` rows were deleted. */
  deletedShareCount: number;
}

/**
 * Phase 1 of the budget-deletion cleanup, intended to run inside the same transaction as
 * `Budgets.destroy(...)`. Revokes any pending invitations for the budget, deletes the
 * `ResourceShares` rows (FK does not CASCADE because `resourceId` is a generic VARCHAR),
 * and returns the recipient set so phase 2 can notify them post-commit.
 *
 * `BudgetTransactions` rows attached to the budget are cleaned up by FK CASCADE when the
 * budget row goes — no explicit sweep needed here. This service only handles the
 * sharing-side state (shares + invitations).
 *
 * Budgets are explicit-share only (no household auto-grant), so there's no household
 * branch — recipients here are the per-resource share recipients only.
 */
export const cleanupBudgetSharesInTx = withTransaction(
  async ({ budgetId, ownerUserId }: { budgetId: string; ownerUserId: number }): Promise<BudgetShareCleanupResult> => {
    const shares = (await ResourceShares.findAll({
      where: { ownerUserId, resourceType: RESOURCE_TYPES.budget, resourceId: budgetId },
      attributes: ['id', 'sharedWithUserId', 'permission'],
      raw: true,
    })) as unknown as Array<{ id: RecordId; sharedWithUserId: number; permission: SharePermission }>;

    const recipients = shares.map((s) => ({
      sharedWithUserId: s.sharedWithUserId,
      shareId: s.id,
      permission: s.permission,
    }));

    const deletedShareCount = await ResourceShares.destroy({
      where: { ownerUserId, resourceType: RESOURCE_TYPES.budget, resourceId: budgetId },
    });

    const [revokedInvitationCount] = await ShareInvitations.update(
      { status: SHARE_INVITATION_STATUSES.revoked, revokedAt: new Date() },
      {
        where: {
          ownerUserId,
          resourceType: RESOURCE_TYPES.budget,
          resourceId: budgetId,
          status: SHARE_INVITATION_STATUSES.pending,
        },
      },
    );

    return { recipients, revokedInvitationCount, deletedShareCount };
  },
);

/**
 * Sweeps `BudgetTransactions` rows that a specific recipient attached, identified by
 * `metadata.addedByUserId`. Called from the revoke-member and leave-share paths when
 * `resourceType === 'budget'` so the budget's contents stay consistent with who currently
 * has access. Owner-attached rows (where `metadata` is null) are untouched. The recipient's
 * own `Transactions` rows are untouched — only the **link** to the budget is removed.
 *
 * Returns the number of join rows removed (for logging / test assertions).
 */
export const sweepRecipientBudgetTransactions = async ({
  budgetId,
  recipientUserId,
}: {
  budgetId: string;
  recipientUserId: number;
}): Promise<number> =>
  BudgetTransactions.destroy({
    where: {
      budgetId,
      [Op.and]: [where(literal(`"metadata"->>'addedByUserId'`), String(recipientUserId))],
    },
  });

/**
 * Phase 2 — best-effort post-commit notification fan-out. Each call is self-transactional
 * via `createNotification`, so a partial failure rolls back only the failing notification.
 * The per-recipient try/catch keeps a single bad row from blocking the rest of the batch.
 */
export const notifyBudgetDeleteRecipients = async ({
  recipients,
  owner,
  budget,
}: {
  recipients: BudgetShareCleanupResult['recipients'];
  owner: Users | null;
  budget: { id: string; name: string };
}): Promise<number> => {
  const resource = { type: RESOURCE_TYPES.budget, id: budget.id, name: budget.name } as const;
  return fanOutNotifications({
    targets: recipients,
    notify: (r) =>
      notifyShareOwnerBudgetDeleted({
        recipientUserId: r.sharedWithUserId,
        owner,
        shareId: r.shareId,
        resource,
        permission: r.permission,
      }),
    errorCode: 'SHARE_OWNER_BUDGET_DELETED_NOTIFY_FAILED',
    errorMessage: 'Failed to emit share_owner_budget_deleted notification',
    buildLogContext: (r) => ({
      shareId: r.shareId,
      recipientUserId: r.sharedWithUserId,
      budgetId: budget.id,
    }),
  });
};
