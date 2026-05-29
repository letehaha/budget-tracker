import { SHARE_INVITATION_STATUSES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import ShareInvitations from '@models/share-invitations.model';
import Users from '@models/users.model';
import { Op } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';
import { resolveResourceName } from '@services/sharing/auth/can-user-access-resource.service';

import { LIFECYCLE_NOTIFIERS } from '../share-notifications';

interface ExpireOverdueResult {
  /** How many rows transitioned to `expired`. */
  expiredCount: number;
  /** How many `share_expired` notifications were emitted. Equal to `expiredCount` unless
   *  a notification call failed (each one is logged, not thrown — one bad row mustn't
   *  block the rest). */
  notifiedCount: number;
}

/**
 * Phase 1 of the daily sweep: in a short transaction, find every overdue `pending` row
 * and bulk-flip its status to `expired`. Returns the rows we just expired so phase 2 can
 * notify their owners — we don't re-query because the underlying status changed.
 */
const flipOverdueToExpired = withTransaction(async (): Promise<ShareInvitations[]> => {
  const overdue = await ShareInvitations.findAll({
    where: {
      status: SHARE_INVITATION_STATUSES.pending,
      expiresAt: { [Op.lte]: new Date() },
    },
  });
  if (!overdue.length) return [];

  const ids = overdue.map((row) => row.id);
  await ShareInvitations.update({ status: SHARE_INVITATION_STATUSES.expired }, { where: { id: { [Op.in]: ids } } });
  return overdue;
});

/**
 * Phase 2: emit a `share_expired` notification per row. Each call is post-commit and
 * self-transactional via `createNotification`'s own wrapper, so a partial failure rolls
 * back only the failing row's notification — the durable status flip already committed
 * in phase 1. The per-row try/catch keeps a single bad row from blocking the rest of
 * the batch.
 */
const notifyExpiredOwners = async (overdue: ShareInvitations[]): Promise<number> => {
  let notifiedCount = 0;
  for (const row of overdue) {
    try {
      const resourceName =
        (await resolveResourceName({
          resourceType: row.resourceType,
          resourceId: row.resourceId,
        })) ?? 'Shared resource';
      let invitee: Users | null = null;
      if (row.inviteeUserId !== null) {
        invitee = await Users.findByPk(row.inviteeUserId);
        if (invitee === null) {
          // FK is `onDelete: SET NULL` on `Users` — when an invitee deletes their account
          // the column nulls automatically. Reaching here means `inviteeUserId` is set
          // but the Users row is gone: a real integrity violation, not the expected
          // null-invitee path. Surface at `error` level (Sentry-routed) with a stable
          // code so ops can spot drift; we still proceed with the notification
          // (snapshotUser falls back to "Unknown user") because the owner deserves the
          // expiration signal regardless.
          logger.error(
            {
              message: 'Dangling inviteeUserId on expire sweep',
              error: new Error(`inviteeUserId=${row.inviteeUserId} has no Users row`),
            },
            {
              code: 'SHARE_INVITEE_USER_MISSING_ON_EXPIRE',
              invitationId: row.id,
              inviteeUserId: row.inviteeUserId,
            },
          );
        }
      }
      const notify = LIFECYCLE_NOTIFIERS.invitationExpired[row.resourceType];
      await notify({
        ownerUserId: row.ownerUserId,
        invitee,
        invitationId: row.id,
        resource: {
          type: row.resourceType,
          id: row.resourceId,
          name: resourceName,
        },
        permission: row.permission,
      });
      notifiedCount += 1;
    } catch (error) {
      // Stable code so ops dashboards group these without depending on the dynamic msg.
      logger.error(
        { message: 'Failed to emit share_expired notification', error: error as Error },
        {
          code: 'SHARE_INVITATION_EXPIRED_NOTIFY_FAILED',
          invitationId: row.id,
          ownerUserId: row.ownerUserId,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
        },
      );
    }
  }
  return notifiedCount;
};

/**
 * Scans `ShareInvitations` for `pending` rows past `expiresAt`, flips them to `expired`,
 * and emits a `share_expired` notification per row to its owner. Used by the daily cron
 * and by tests (which call this directly instead of waiting for the schedule).
 *
 * Two-phase shape: a short transaction commits the durable status flip first, then
 * notifications happen post-commit. This mirrors `create-invitation`'s commit-then-email
 * pattern — the alternative (one big transaction) would (a) hold row locks for the
 * duration of N notification writes, (b) re-emit every notification on the next cron run
 * if any uncaught error escapes, and (c) leak partial-write hazards if `createNotification`
 * ever grows multi-statement bodies.
 */
export const expireOverdueInvitations = async (): Promise<ExpireOverdueResult> => {
  const overdue = await flipOverdueToExpired();
  if (!overdue.length) return { expiredCount: 0, notifiedCount: 0 };
  const notifiedCount = await notifyExpiredOwners(overdue);
  return { expiredCount: overdue.length, notifiedCount };
};
