import type { AbstractQueryInterface, Transaction } from '@sequelize/core';

/**
 * Extends the polymorphic share-table `resourceType` shape CHECK constraints to admit
 * `'budget'` rows. Budget ids are UUID v7s, so the budget branch reuses the same UUID
 * regex as `'account'`. Household keeps its numeric `resourceId = ownerUserId::text`
 * branch unchanged.
 *
 * Without this migration the service layer would happily build a `ResourceShares`
 * row for `resourceType = 'budget'`, but the insert would trip the CHECK constraint
 * at commit time — surfacing as a 422 from the accept-invitation endpoint and a host
 * of cascading failures in any test that exercises a budget invitation.
 */

const RESOURCE_TYPE_SHAPE_WITH_BUDGET = `
  ("resourceType" = 'account' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  OR
  ("resourceType" = 'household' AND "resourceId" ~ '^[0-9]+$' AND "resourceId" = "ownerUserId"::text)
  OR
  ("resourceType" = 'budget' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
`;

/** Prior shape (account UUID + household numeric) — used by the `down` migration to
 *  restore the pre-budget state. Kept verbatim so the revert is a faithful inverse. */
const RESOURCE_TYPE_SHAPE_PRE_BUDGET = `
  ("resourceType" = 'account' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  OR
  ("resourceType" = 'household' AND "resourceId" ~ '^[0-9]+$' AND "resourceId" = "ownerUserId"::text)
`;

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // `IF EXISTS` matches the convention from the original household-shape migration
      // so a partial re-run during dev / CI doesn't hard-fail on the second pass.
      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_type_shape";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" DROP CONSTRAINT IF EXISTS "chk_share_invitations_type_shape";`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_type_shape"
         CHECK (${RESOURCE_TYPE_SHAPE_WITH_BUDGET});`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_type_shape"
         CHECK (${RESOURCE_TYPE_SHAPE_WITH_BUDGET});`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_type_shape";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" DROP CONSTRAINT IF EXISTS "chk_share_invitations_type_shape";`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_type_shape"
         CHECK (${RESOURCE_TYPE_SHAPE_PRE_BUDGET});`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_type_shape"
         CHECK (${RESOURCE_TYPE_SHAPE_PRE_BUDGET});`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
