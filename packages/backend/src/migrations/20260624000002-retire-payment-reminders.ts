import { QueryInterface, Transaction } from 'sequelize';

/**
 * Retires the payment-reminders feature: its scheduling/mark-paid capability now
 * lives entirely in the subscriptions feature. Existing reminder data is copied
 * into the subscriptions tables (so users keep their recurring payments under
 * "Recurring Charges"), then the payment_reminder* tables and their Postgres
 * enums are dropped.
 *
 * Mapping notes:
 * - A PaymentReminder becomes a Subscription, reusing the same UUID so the
 *   periods' foreign key (reminderId -> subscriptionId) carries over unchanged.
 * - frequency / type enums share identical labels between the two features, so a
 *   text cast suffices. A reminder with no frequency falls back to 'monthly'.
 * - Subscriptions require a startDate (reminders have none): the earliest period
 *   due date is used, falling back to the reminder's dueDate, then its createdAt.
 * - Reminders have no matching rules; subscriptions get an empty rule set.
 * - A reminder period can carry a linked transaction (the LINK-mode pay on the
 *   retired feature), so transactionId is copied through to preserve the link.
 *   transactionAutoCreated copies as false for every row because the retired
 *   feature only supported LINK-mode pays (it never generated transactions), so
 *   reverting a migrated period will never delete its linked transaction.
 * - In-app Notifications carrying the old type='payment_reminder' are rewritten
 *   to type='subscription_reminder' to stay routable after the rename.
 *
 * Forward-only: the source rows are deleted by the drops, so down() cannot
 * restore them.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. PaymentReminders -> Subscriptions (same id reused as the subscription id).
      await queryInterface.sequelize.query(
        `
        INSERT INTO "Subscriptions" (
          "id", "userId", "name", "type", "expectedAmount", "expectedCurrencyCode",
          "frequency", "startDate", "endDate", "matchingRules", "isActive", "notes",
          "createdAt", "updatedAt", "accountId", "categoryId", "dueDate", "anchorDay",
          "maxOccurrences", "showInWidget", "remindBefore", "notifyEmail"
        )
        SELECT
          pr."id",
          pr."userId",
          pr."name",
          COALESCE(pr."type", 'subscription')::"enum_Subscriptions_type",
          pr."expectedAmount",
          pr."currencyCode",
          COALESCE(pr."frequency"::text, 'monthly')::"enum_Subscriptions_frequency",
          COALESCE(
            (SELECT MIN(p."dueDate") FROM "PaymentReminderPeriods" p WHERE p."reminderId" = pr."id"),
            pr."dueDate",
            pr."createdAt"::date
          ),
          NULL,
          '{"rules": []}'::jsonb,
          pr."isActive",
          pr."notes",
          pr."createdAt",
          pr."updatedAt",
          pr."accountId",
          pr."categoryId",
          pr."dueDate",
          pr."anchorDay",
          pr."maxOccurrences",
          COALESCE(pr."showInWidget", true),
          pr."remindBefore",
          pr."notifyEmail"
        FROM "PaymentReminders" pr;
        `,
        { transaction: t },
      );

      // 2. PaymentReminderPeriods -> SubscriptionPeriods (reminderId becomes subscriptionId).
      await queryInterface.sequelize.query(
        `
        INSERT INTO "SubscriptionPeriods" (
          "id", "subscriptionId", "dueDate", "status", "paidAt", "transactionId",
          "transactionAutoCreated", "notes", "createdAt", "updatedAt"
        )
        SELECT
          p."id",
          p."reminderId",
          p."dueDate",
          p."status"::text,
          p."paidAt",
          -- A LINK-mode pay on the retired feature stored a real transactionId;
          -- copy it through so the settling transaction stays attached. The
          -- destination column is onDelete SET NULL, so the link is safe to carry.
          p."transactionId",
          -- Always false: the retired feature only supported LINK-mode pays, so it
          -- never generated transactions. Reverting therefore never deletes a
          -- migrated period's linked transaction.
          COALESCE(p."transactionAutoCreated", false),
          p."notes",
          p."createdAt",
          p."updatedAt"
        FROM "PaymentReminderPeriods" p;
        `,
        { transaction: t },
      );

      // 3. PaymentReminderNotifications -> SubscriptionPeriodNotifications (dedup ledger; same ids).
      await queryInterface.sequelize.query(
        `
        INSERT INTO "SubscriptionPeriodNotifications" (
          "id", "periodId", "remindBeforePreset", "sentAt", "emailSent", "emailError"
        )
        SELECT
          n."id",
          n."periodId",
          n."remindBeforePreset",
          n."sentAt",
          n."emailSent",
          n."emailError"
        FROM "PaymentReminderNotifications" n;
        `,
        { transaction: t },
      );

      // 4. Backfill the renamed notification type. NOTIFICATION_TYPES renamed
      // 'payment_reminder' to 'subscription_reminder'; existing in-app rows still
      // carry the old value and would be non-routable after deploy without this.
      await queryInterface.sequelize.query(
        `UPDATE "Notifications" SET "type" = 'subscription_reminder' WHERE "type" = 'payment_reminder';`,
        { transaction: t },
      );

      // 5. Drop the reminder tables (children first) and their enums.
      await queryInterface.dropTable('PaymentReminderNotifications', { transaction: t });
      await queryInterface.dropTable('PaymentReminderPeriods', { transaction: t });
      await queryInterface.dropTable('PaymentReminders', { transaction: t });

      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_PaymentReminderPeriods_status";', {
        transaction: t,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_PaymentReminders_frequency";', {
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (): Promise<void> => {
    // The reminder rows are migrated into subscriptions and the source tables are
    // dropped, so this retirement cannot be reversed automatically. Restoring the
    // feature means re-running the original payment-reminders creation migrations
    // against a backup.
    throw new Error(
      'retire-payment-reminders is irreversible: data was migrated into subscriptions and the source tables were dropped.',
    );
  },
};
