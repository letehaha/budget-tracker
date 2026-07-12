import { QueryInterface, QueryTypes } from 'sequelize';

// Subscriptions store an `expectedCurrencyCode` that the summary endpoint
// converts into the user's base currency, and that conversion requires a
// UsersCurrencies row for the currency. Subscription create/update now connect
// the currency automatically, but rows created before that guard exist in any
// currency the user never connected — their summary conversion fails with
// CURRENCY_NOT_CONNECTED. Backfill the missing UsersCurrencies rows.
//
// Row defaults mirror the addCurrency service (liveRateUpdate = true,
// isDefaultCurrency = false, no manual exchangeRate). The INSERT is set-based
// and guarded by NOT EXISTS, so re-running the migration is a no-op.
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [countRow] = await queryInterface.sequelize.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM (
            SELECT DISTINCT s."userId", s."expectedCurrencyCode"
            FROM "Subscriptions" AS s
            WHERE s."expectedCurrencyCode" IS NOT NULL
              AND EXISTS (SELECT 1 FROM "Currencies" AS c WHERE c."code" = s."expectedCurrencyCode")
              AND NOT EXISTS (
                SELECT 1 FROM "UsersCurrencies" AS uc
                WHERE uc."userId" = s."userId" AND uc."currencyCode" = s."expectedCurrencyCode"
              )
          ) AS missing;
        `,
        { transaction, type: QueryTypes.SELECT },
      );

      const missingCount = Number(countRow?.count ?? 0);
      if (missingCount > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[migration 20260706000000] connecting ${missingCount} subscription currency(ies) to their users.`,
        );
      }

      // UsersCurrencies.id has a model-level uuid default only (no DB default),
      // so the id must be generated in SQL.
      await queryInterface.sequelize.query(
        `
          INSERT INTO "UsersCurrencies" ("id", "userId", "currencyCode", "exchangeRate", "liveRateUpdate", "isDefaultCurrency")
          SELECT gen_random_uuid(), missing."userId", missing."expectedCurrencyCode", NULL, true, false
          FROM (
            SELECT DISTINCT s."userId", s."expectedCurrencyCode"
            FROM "Subscriptions" AS s
            WHERE s."expectedCurrencyCode" IS NOT NULL
              AND EXISTS (SELECT 1 FROM "Currencies" AS c WHERE c."code" = s."expectedCurrencyCode")
              AND NOT EXISTS (
                SELECT 1 FROM "UsersCurrencies" AS uc
                WHERE uc."userId" = s."userId" AND uc."currencyCode" = s."expectedCurrencyCode"
              )
          ) AS missing;
        `,
        { transaction },
      );
    });
  },

  down: async (): Promise<void> => {
    // The inserted rows are indistinguishable from currencies users connected
    // themselves, so removing them could sever genuine connections. Throw so a
    // rollback attempt surfaces to operators instead of silently deleting data.
    throw new Error(
      'Cannot down-migrate 20260706000000-connect-subscription-currencies: ' +
        'backfilled UsersCurrencies rows cannot be told apart from user-created ones. ' +
        'Reconcile manually if a rollback is truly required.',
    );
  },
};
