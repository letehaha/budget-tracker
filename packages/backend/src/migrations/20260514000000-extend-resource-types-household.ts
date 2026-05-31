import type { AbstractQueryInterface, Transaction } from '@sequelize/core';

const RESOURCE_TYPE_SHAPE = `
  ("resourceType" = 'account' AND "resourceId" ~ '^[0-9]+$')
  OR
  ("resourceType" = 'household' AND "resourceId" ~ '^[0-9]+$' AND "resourceId" = "ownerUserId"::text)
`;

const HOUSEHOLD_PERMISSION_RESTRICTION = `
  "resourceType" <> 'household' OR "permission" IN ('read', 'write')
`;

// Defense in depth against a self-share write — the service layer rejects this in
// `create-invitation` but the DB-level CHECK closes the gap if anything ever bypasses
// the service (raw SQL admin scripts, future direct seeders, etc.).
const NO_SELF_SHARE = `
  "sharedWithUserId" IS NULL OR "sharedWithUserId" <> "ownerUserId"
`;

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // Replace the original single-value resource-type CHECKs (`'account'`-only) with shape
      // CHECKs that also admit `'household'` rows. Household rows carry
      // `resourceId = ownerUserId::text` by convention; the shape CHECK enforces
      // that invariant at the DB level so service-layer bugs cannot poison the
      // table.
      // `IF EXISTS` so partial re-runs of this migration during dev / CI don't fail
      // on the second pass after the constraints have already been dropped.
      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_resource_type";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" DROP CONSTRAINT IF EXISTS "chk_share_invitations_resource_type";`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_type_shape"
         CHECK (${RESOURCE_TYPE_SHAPE});`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_type_shape"
         CHECK (${RESOURCE_TYPE_SHAPE});`,
        { transaction: t },
      );

      // Household rows reject `'manage'` permission. Owner-only operations remain
      // owner-only; household membership grants read or write, never manage.
      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_household_permission"
         CHECK (${HOUSEHOLD_PERMISSION_RESTRICTION});`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_household_permission"
         CHECK (${HOUSEHOLD_PERMISSION_RESTRICTION});`,
        { transaction: t },
      );

      // Prevent a user from sharing a resource with themselves at the DB layer. The
      // service-level guard in `create-invitation` already does this, but the CHECK
      // is a backstop for raw-SQL seeders / admin scripts that bypass the service.
      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_no_self_share"
         CHECK (${NO_SELF_SHARE});`,
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
        `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_no_self_share";`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_household_permission";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" DROP CONSTRAINT IF EXISTS "chk_share_invitations_household_permission";`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_type_shape";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" DROP CONSTRAINT IF EXISTS "chk_share_invitations_type_shape";`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_resource_type"
         CHECK ("resourceType" IN ('account'));`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_resource_type"
         CHECK ("resourceType" IN ('account'));`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
