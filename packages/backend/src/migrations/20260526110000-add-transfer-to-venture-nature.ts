import { QueryInterface } from 'sequelize';

/**
 * Adds the `transfer_to_venture` value to the existing `enum_transfer_nature`
 * Postgres enum. Mirrors `transfer_to_portfolio` semantically: a transaction
 * whose money flowed to a tracked entity (here, a VentureDeal via a
 * VentureEventLink) rather than out of the user's tracked accounts.
 *
 * PostgreSQL prohibits `ALTER TYPE ... ADD VALUE` inside an explicit
 * transaction, so we issue the query directly (no withTransaction wrapper).
 *
 * Down: the enum value cannot be removed without rewriting the whole type +
 * column. We reset any rows still using the value to `not_transfer` first to
 * avoid invalid states. This mirrors `20260301000000-add-transfer-to-portfolio`.
 */

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_transfer_nature" ADD VALUE IF NOT EXISTS 'transfer_to_venture';`,
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `UPDATE "Transactions" SET "transferNature" = 'not_transfer' WHERE "transferNature" = 'transfer_to_venture';`,
    );

    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `CREATE TYPE "enum_transfer_nature_new" AS ENUM (
           'not_transfer',
           'transfer_between_user_accounts',
           'transfer_out_wallet',
           'transfer_to_portfolio'
         );`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(`ALTER TABLE "Transactions" ALTER COLUMN "transferNature" DROP DEFAULT;`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" ALTER COLUMN "transferNature" TYPE "enum_transfer_nature_new" USING "transferNature"::text::"enum_transfer_nature_new";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(`DROP TYPE "enum_transfer_nature";`, { transaction: t });
      await queryInterface.sequelize.query(`ALTER TYPE "enum_transfer_nature_new" RENAME TO "enum_transfer_nature";`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE "Transactions" ALTER COLUMN "transferNature" SET DEFAULT 'not_transfer'::"enum_transfer_nature";`,
        { transaction: t },
      );
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
