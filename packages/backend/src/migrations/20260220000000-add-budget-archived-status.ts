import { QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // PostgreSQL doesn't allow ALTER TYPE ADD VALUE inside a transaction
    await queryInterface.sequelize.query(`ALTER TYPE "enum_Budgets_status" ADD VALUE IF NOT EXISTS 'archived';`);
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    // Revert any archived budgets back to active so the data is valid
    // after removing the enum value
    await queryInterface.sequelize.query(`UPDATE "Budgets" SET status = 'active' WHERE status = 'archived';`);

    // PostgreSQL doesn't support dropping individual enum values directly.
    // Recreate the enum without 'archived'.
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(`CREATE TYPE "enum_Budgets_status_new" AS ENUM ('active', 'closed');`, {
        transaction: t,
      });
      // Drop the default before changing the column type, otherwise PostgreSQL
      // cannot cast the default value to the new enum automatically.
      await queryInterface.sequelize.query(`ALTER TABLE "Budgets" ALTER COLUMN status DROP DEFAULT;`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE "Budgets" ALTER COLUMN status TYPE "enum_Budgets_status_new" USING status::text::"enum_Budgets_status_new";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(`DROP TYPE "enum_Budgets_status";`, { transaction: t });
      await queryInterface.sequelize.query(`ALTER TYPE "enum_Budgets_status_new" RENAME TO "enum_Budgets_status";`, {
        transaction: t,
      });
      // Restore the default
      await queryInterface.sequelize.query(
        `ALTER TABLE "Budgets" ALTER COLUMN status SET DEFAULT 'active'::"enum_Budgets_status";`,
        { transaction: t },
      );
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
