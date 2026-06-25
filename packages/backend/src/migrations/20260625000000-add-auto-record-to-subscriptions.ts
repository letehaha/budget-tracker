import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Adds `autoRecord` to Subscriptions. When true, a dedicated hourly cron creates
 * the expense transaction for any upcoming period whose dueDate has arrived,
 * marking the period paid in the same step. Lets users with no bank import (and
 * fixed installment schedules) avoid manually booking every cycle.
 *
 * Two DB CHECK constraints mirror the service-level validation as defence-in-depth:
 *
 *  1. Auto-record requires the booking inputs (account + amount + currency) the
 *     cron will hand to `markPeriodPaid` in CREATE mode. Without them the cron
 *     would throw on every tick.
 *  2. Auto-record and matching rules are mutually exclusive — both would race to
 *     book the same period (auto-record on dueDate, matching on bank import) and
 *     leave duplicate transactions for the user to clean up.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'Subscriptions',
        'autoRecord',
        {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ADD CONSTRAINT "chk_subscriptions_auto_record_requires_booking_inputs"
         CHECK (
           "autoRecord" = false OR (
             "accountId" IS NOT NULL AND
             "expectedAmount" IS NOT NULL AND
             "expectedCurrencyCode" IS NOT NULL
           )
         );`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ADD CONSTRAINT "chk_subscriptions_auto_record_excludes_matching_rules"
         CHECK (
           "autoRecord" = false OR
           jsonb_array_length(COALESCE("matchingRules"->'rules', '[]'::jsonb)) = 0
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
        `ALTER TABLE "Subscriptions" DROP CONSTRAINT IF EXISTS "chk_subscriptions_auto_record_excludes_matching_rules";`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" DROP CONSTRAINT IF EXISTS "chk_subscriptions_auto_record_requires_booking_inputs";`,
        { transaction: t },
      );

      await queryInterface.removeColumn('Subscriptions', 'autoRecord', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
