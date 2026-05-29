import { RESOURCE_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import ResourceShares from '@models/resource-shares.model';
import { withTransaction } from '@services/common/with-transaction';

interface OrphanShareCleanupResult {
  /** `ResourceShares` rows deleted because their referenced resource no longer exists. */
  deletedSharesCount: number;
  /** `ShareInvitations` rows deleted for the same reason. */
  deletedInvitationsCount: number;
}

/**
 * Single-sweep size that triggers a warning log. Catches runaway cascades early —
 * a daily sweep that touches more than a hundred rows almost certainly means a
 * deletion path is skipping the inline cleanup hooks, and somebody should look
 * at it.
 */
const RUNAWAY_SWEEP_THRESHOLD = 100;

/**
 * Daily safety-net sweep that drops `ResourceShares` and `ShareInvitations` rows whose
 * referenced resource no longer exists. The account-delete and user-delete cleanup hooks
 * are the primary paths; this cron handles the corner cases where they didn't run —
 * direct DB deletes, future cascades that bypass the hook, or any code path that drops
 * the underlying resource without going through the service layer.
 *
 * `resourceId` is a generic `VARCHAR(255)`, so the FK from share rows to the underlying
 * resource is application-enforced rather than DB-level. That's why a sweep is needed
 * rather than relying on `ON DELETE CASCADE`. Account rows look up against `Accounts`;
 * household rows look up against `Users` (since `resourceId = ownerUserId::text`).
 */
/**
 * One entry per resource type — declares which table backs its `resourceId`. The sweep
 * iterates this list for both ResourceShares and ShareInvitations, so adding a new
 * shareable resource type is a single entry here instead of four parallel SQL queries.
 */
const ORPHAN_SWEEP_DEFINITIONS: ReadonlyArray<{ resourceType: string; foreignTable: string }> = [
  { resourceType: RESOURCE_TYPES.account, foreignTable: 'Accounts' },
  // Household rows store `resourceId = ownerUserId::text` by convention.
  { resourceType: RESOURCE_TYPES.household, foreignTable: 'Users' },
  { resourceType: RESOURCE_TYPES.budget, foreignTable: 'Budgets' },
];

const sweepOrphans = async ({
  sequelize,
  sourceTable,
  resourceType,
  foreignTable,
}: {
  sequelize: NonNullable<typeof ResourceShares.sequelize>;
  sourceTable: 'ResourceShares' | 'ShareInvitations';
  resourceType: string;
  foreignTable: string;
}): Promise<number> => {
  // Cast `Accounts.id` / `Users.id` (INTEGER) to text since `resourceId` is VARCHAR.
  // Using `NOT IN (SELECT ...)` rather than a JOIN+IS NULL because Postgres handles
  // the empty-target edge correctly: the subquery returns no rows, the predicate is
  // `... NOT IN ()` → TRUE for everything, and every matching row gets cleaned.
  // Sequelize's `Op.notIn` with an empty array generates `... NOT IN (NULL)` which
  // is FALSE-y, so the equivalent ORM call would silently skip orphan rows when the
  // target table is empty.
  const [, meta] = (await sequelize.query(
    `DELETE FROM "${sourceTable}"
     WHERE "resourceType" = :type
       AND "resourceId" NOT IN (SELECT id::text FROM "${foreignTable}")`,
    { replacements: { type: resourceType } },
  )) as [unknown, { rowCount?: number }];
  return meta.rowCount ?? 0;
};

const cleanupOrphanSharesImpl = async (): Promise<OrphanShareCleanupResult> => {
  const sequelize = ResourceShares.sequelize;
  if (!sequelize) {
    throw new Error('ResourceShares model is not bound to a Sequelize instance');
  }

  // Per-(table, resourceType) row count — used both for the aggregated return value and
  // for the runaway-threshold log so ops can tell which dimension spiked.
  const breakdown: Record<string, number> = {};
  let deletedSharesCount = 0;
  let deletedInvitationsCount = 0;

  for (const { resourceType, foreignTable } of ORPHAN_SWEEP_DEFINITIONS) {
    const sharesDeleted = await sweepOrphans({
      sequelize,
      sourceTable: 'ResourceShares',
      resourceType,
      foreignTable,
    });
    const invitationsDeleted = await sweepOrphans({
      sequelize,
      sourceTable: 'ShareInvitations',
      resourceType,
      foreignTable,
    });
    breakdown[`${resourceType}Shares`] = sharesDeleted;
    breakdown[`${resourceType}Invitations`] = invitationsDeleted;
    deletedSharesCount += sharesDeleted;
    deletedInvitationsCount += invitationsDeleted;
  }

  if (deletedSharesCount + deletedInvitationsCount > RUNAWAY_SWEEP_THRESHOLD) {
    // A normal day touches zero rows. A spike means something upstream is creating
    // orphans — surface it for ops to investigate before the table grows unbounded.
    // The per-dimension breakdown points at which path is leaking.
    logger.warn('Orphan share cleanup swept more rows than the runaway-cascade threshold', {
      code: 'ORPHAN_SHARE_CLEANUP_RUNAWAY',
      deletedSharesCount,
      deletedInvitationsCount,
      threshold: RUNAWAY_SWEEP_THRESHOLD,
      breakdown,
    });
  }

  return {
    deletedSharesCount,
    deletedInvitationsCount,
  };
};

/**
 * Wraps the sweep in a single transaction so a partial failure can't leave the system
 * with shares deleted but invitations dangling. Used by the daily cron and by tests
 * (which call this directly instead of waiting for the schedule).
 */
export const cleanupOrphanShares = withTransaction(cleanupOrphanSharesImpl);
