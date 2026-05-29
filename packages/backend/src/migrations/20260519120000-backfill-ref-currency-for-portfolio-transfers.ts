import { QueryTypes } from '@sequelize/core';
import type { AbstractQueryInterface } from '@sequelize/core';

// account→portfolio and portfolio→account transfer services historically created
// the linked Transaction without populating `refCurrencyCode`. The numerical
// `refAmount` is still correct (it was computed from the user's base currency),
// but the column was left NULL and breaks aggregations that filter/join on
// `refCurrencyCode`.
//
// Backfill every affected row by joining to the owner's current default
// UsersCurrencies entry. Only touches rows where refCurrencyCode is still NULL,
// so re-running the migration is a no-op.
//
// Caveat: the join uses the user's CURRENT default currency. If a user changed
// their base currency between when the buggy transfer was created and when this
// migration runs, the stamped `refCurrencyCode` will not match the historical
// base that `refAmount` was originally computed against. We accept the
// inconsistency because (a) the prior state (NULL refCurrencyCode) breaks
// aggregations entirely, so any non-NULL stamp is a strict improvement, and
// (b) recomputing every `refAmount` via historical FX would require a working
// rate cache for arbitrary past dates, which is not guaranteed.
//
// Rows belonging to users with no `isDefaultCurrency=true` UsersCurrencies row
// (incomplete onboarding, manual DB state) cannot be backfilled by this join.
// We surface their count so operators can reconcile manually; without the
// log, the new `@BeforeUpdate` validator would later reject any update to
// those rows with no breadcrumb pointing back to this migration.
module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [orphanRow] = await queryInterface.sequelize.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM "Transactions" AS t
          LEFT JOIN "UsersCurrencies" AS uc
            ON uc."userId" = t."userId" AND uc."isDefaultCurrency" = true
          WHERE t."transferNature" = 'transfer_to_portfolio'
            AND t."refCurrencyCode" IS NULL
            AND uc."id" IS NULL;
        `,
        { transaction, type: QueryTypes.SELECT },
      );

      const orphanCount = Number(orphanRow?.count ?? 0);
      if (orphanCount > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[migration 20260519120000] ${orphanCount} transfer_to_portfolio row(s) have NULL refCurrencyCode ` +
            `but the owning user has no default-currency row — these will remain NULL after backfill and will ` +
            `fail the @BeforeUpdate validator on future updates. Reconcile UsersCurrencies for those users.`,
        );
      }

      await queryInterface.sequelize.query(
        `
          UPDATE "Transactions" AS t
          SET "refCurrencyCode" = uc."currencyCode"
          FROM "UsersCurrencies" AS uc
          WHERE uc."userId" = t."userId"
            AND uc."isDefaultCurrency" = true
            AND t."transferNature" = 'transfer_to_portfolio'
            AND t."refCurrencyCode" IS NULL;
        `,
        { transaction },
      );
    });
  },

  down: async (): Promise<void> => {
    // Re-introducing NULL refCurrencyCode would resurrect the data bug, so this
    // migration is not safely reversible. Throw rather than silently succeed so
    // rollback attempts surface to operators instead of leaving the schema in a
    // state the old code didn't expect.
    throw new Error(
      'Cannot down-migrate 20260519120000-backfill-ref-currency-for-portfolio-transfers: ' +
        'reverting would re-introduce NULL refCurrencyCode rows that break aggregations. ' +
        'Reconcile manually if a rollback is truly required.',
    );
  },
};
