import { RESOURCE_TYPES } from '@bt/shared/types';
import ResourceShares from '@models/resource-shares.model';
import { withTransaction } from '@services/common/with-transaction';

interface OrphanShareCleanupResult {
  /** `ResourceShares` rows deleted because their referenced resource no longer exists. */
  deletedSharesCount: number;
  /** `ShareInvitations` rows deleted for the same reason. */
  deletedInvitationsCount: number;
}

/**
 * Daily safety-net sweep that drops `ResourceShares` and `ShareInvitations` rows whose
 * referenced resource no longer exists. The account-delete cleanup hook
 * (`cleanupAccountSharesInTx`) is the primary path; this cron handles the corner cases
 * where it didn't run — direct DB deletes, future cascades that bypass the hook, or any
 * code path that drops accounts without going through the service layer.
 *
 * `resourceId` is a generic `VARCHAR(255)` (Phase 1+ schema), so the FK from share rows
 * to the underlying resource is application-enforced rather than DB-level. That's why a
 * sweep is needed rather than relying on `ON DELETE CASCADE`.
 */
const cleanupOrphanSharesImpl = async (): Promise<OrphanShareCleanupResult> => {
  const sequelize = ResourceShares.sequelize;
  if (!sequelize) {
    throw new Error('ResourceShares model is not bound to a Sequelize instance');
  }

  // Cast `Accounts.id` (INTEGER) to text since `resourceId` is VARCHAR. Using
  // `NOT IN (SELECT ...)` rather than a JOIN+IS NULL because Postgres handles
  // the empty-Accounts edge correctly: the subquery returns no rows, the predicate
  // is `... NOT IN ()` → TRUE for everything, and every account-typed share row
  // gets cleaned. Sequelize's `Op.notIn` with an empty array generates
  // `... NOT IN (NULL)` which is FALSE-y, so the equivalent ORM call would silently
  // skip orphan rows when the Accounts table is empty.
  const [, sharesMeta] = (await sequelize.query(
    `DELETE FROM "ResourceShares"
     WHERE "resourceType" = :type
       AND "resourceId" NOT IN (SELECT id::text FROM "Accounts")`,
    { replacements: { type: RESOURCE_TYPES.account } },
  )) as [unknown, { rowCount?: number }];

  const [, invitationsMeta] = (await sequelize.query(
    `DELETE FROM "ShareInvitations"
     WHERE "resourceType" = :type
       AND "resourceId" NOT IN (SELECT id::text FROM "Accounts")`,
    { replacements: { type: RESOURCE_TYPES.account } },
  )) as [unknown, { rowCount?: number }];

  return {
    deletedSharesCount: sharesMeta.rowCount ?? 0,
    deletedInvitationsCount: invitationsMeta.rowCount ?? 0,
  };
};

/**
 * Wraps the sweep in a single transaction so a partial failure can't leave the system
 * with shares deleted but invitations dangling. Used by the daily cron and by tests
 * (which call this directly instead of waiting for the schedule).
 */
export const cleanupOrphanShares = withTransaction(cleanupOrphanSharesImpl);
