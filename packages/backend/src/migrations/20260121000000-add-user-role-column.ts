import { QueryInterface, Transaction } from 'sequelize';

/**
 * Migration to add role and createdAt columns to Users table.
 *
 * Roles:
 * - 'admin': Full access to all features
 * - 'common': Regular registered user (default)
 * - 'demo': Temporary demo user (auto-deleted after 6 hours)
 *
 * The createdAt column is needed to track when demo users were created
 * for the automatic cleanup process.
 *
 * This enables the demo mode feature where visitors can try the app
 * without registration.
 */

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Step 1: Add role column if it doesn't exist (using raw SQL for reliability)
      await queryInterface.sequelize.query(`ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS role VARCHAR(20)`, {
        transaction: t,
      });

      // Step 2: Update all null role values to 'common'
      await queryInterface.sequelize.query(`UPDATE "Users" SET role = 'common' WHERE role IS NULL`, {
        transaction: t,
      });

      // Step 3: Set default and NOT NULL for role
      await queryInterface.sequelize.query(`ALTER TABLE "Users" ALTER COLUMN role SET DEFAULT 'common'`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(`ALTER TABLE "Users" ALTER COLUMN role SET NOT NULL`, {
        transaction: t,
      });

      // Step 4: Add createdAt column if it doesn't exist
      await queryInterface.sequelize.query(
        `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE`,
        { transaction: t },
      );

      // Step 5: Update all null createdAt values to NOW()
      await queryInterface.sequelize.query(`UPDATE "Users" SET "createdAt" = NOW() WHERE "createdAt" IS NULL`, {
        transaction: t,
      });

      // Step 6: Set default and NOT NULL for createdAt
      await queryInterface.sequelize.query(`ALTER TABLE "Users" ALTER COLUMN "createdAt" SET DEFAULT NOW()`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(`ALTER TABLE "Users" ALTER COLUMN "createdAt" SET NOT NULL`, {
        transaction: t,
      });

      // Step 7: Add indexes (ignore if they already exist)
      try {
        await queryInterface.sequelize.query(
          `CREATE INDEX IF NOT EXISTS users_demo_cleanup_idx ON "Users" (role, "createdAt") WHERE role = 'demo'`,
          { transaction: t },
        );
      } catch {
        // Index might already exist
      }

      try {
        await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS users_role_idx ON "Users" (role)`, {
          transaction: t,
        });
      } catch {
        // Index might already exist
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove indexes first
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS users_demo_cleanup_idx`, { transaction: t });
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS users_role_idx`, { transaction: t });

      // Remove columns
      await queryInterface.sequelize.query(`ALTER TABLE "Users" DROP COLUMN IF EXISTS role`, { transaction: t });
      await queryInterface.sequelize.query(`ALTER TABLE "Users" DROP COLUMN IF EXISTS "createdAt"`, { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
