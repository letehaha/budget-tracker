import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Adds the `installment` subscription type. Two schema changes support it:
 *
 * 1. `type` moves from a Postgres ENUM to VARCHAR so new values are added in
 *    TS (SUBSCRIPTION_TYPES) without an ALTER TYPE round-trip, matching the
 *    project's no-DB-enum convention.
 * 2. `completedAt` records when an installment consumes its full schedule (the
 *    engine deactivates it at the same moment). It tells a finished installment
 *    apart from a manually paused one — both carry isActive=false.
 *
 * An installment is a finite plan, so a CHECK constraint requires it to carry
 * both a payment count (`maxOccurrences`) and a schedule (`dueDate`).
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // The type CHECK references the column, so drop it before retyping it.
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" DROP CONSTRAINT IF EXISTS "chk_subscriptions_type_requires_amount";`,
        { transaction: t },
      );

      // The enum default must go before the enum type can be dropped.
      await queryInterface.sequelize.query(`ALTER TABLE "Subscriptions" ALTER COLUMN "type" DROP DEFAULT;`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ALTER COLUMN "type" TYPE VARCHAR(50) USING "type"::text;`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ALTER COLUMN "type" SET DEFAULT 'subscription';`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_Subscriptions_type";`, { transaction: t });

      await queryInterface.addColumn(
        'Subscriptions',
        'completedAt',
        {
          type: DataTypes.DATE,
          allowNull: true,
        },
        { transaction: t },
      );

      // Re-add the original amount constraint (subscriptions require amount + currency).
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ADD CONSTRAINT "chk_subscriptions_type_requires_amount"
         CHECK (
           "type" != 'subscription' OR
           ("expectedAmount" IS NOT NULL AND "expectedCurrencyCode" IS NOT NULL)
         );`,
        { transaction: t },
      );

      // Installments are finite plans: they need a payment count and a schedule.
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ADD CONSTRAINT "chk_subscriptions_installment_requires_schedule"
         CHECK (
           "type" != 'installment' OR
           ("maxOccurrences" IS NOT NULL AND "dueDate" IS NOT NULL)
         );`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" DROP CONSTRAINT IF EXISTS "chk_subscriptions_installment_requires_schedule";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" DROP CONSTRAINT IF EXISTS "chk_subscriptions_type_requires_amount";`,
        { transaction: t },
      );

      await queryInterface.removeColumn('Subscriptions', 'completedAt', { transaction: t });

      // Restore the two-value enum. Fails if any 'installment' rows remain — clear
      // them before reverting, since the narrowed enum cannot represent them.
      await queryInterface.sequelize.query(`CREATE TYPE "enum_Subscriptions_type" AS ENUM('subscription', 'bill');`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(`ALTER TABLE "Subscriptions" ALTER COLUMN "type" DROP DEFAULT;`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ALTER COLUMN "type" TYPE "enum_Subscriptions_type" USING "type"::"enum_Subscriptions_type";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ALTER COLUMN "type" SET DEFAULT 'subscription';`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ADD CONSTRAINT "chk_subscriptions_type_requires_amount"
         CHECK (
           "type" != 'subscription' OR
           ("expectedAmount" IS NOT NULL AND "expectedCurrencyCode" IS NOT NULL)
         );`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
