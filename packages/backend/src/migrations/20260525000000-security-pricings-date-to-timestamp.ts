import type { AbstractQueryInterface } from '@sequelize/core';
import { QueryTypes } from '@sequelize/core';

/**
 * Widen `SecurityPricings.date` from DATE to TIMESTAMP WITH TIME ZONE.
 *
 * Background: the column was originally DATEONLY because the only source of
 * truth was end-of-day stock closes. CoinGecko crypto support introduced the
 * need for intraday timestamps — markets are 24/7 and we want hourly snapshots,
 * not one row per day. DATEONLY collapses every intraday fetch into the same
 * row, throwing away the granularity.
 *
 * Behaviour after this migration:
 *   - Stocks continue to write one row per day, anchored at midnight UTC of
 *     that day (the cron computes the timestamp explicitly).
 *   - Crypto writes one row per fetch, anchored at CoinGecko's `last_updated_at`
 *     (the moment their oracle updated). The unique `(securityId, date)` index
 *     naturally dedupes when two cron runs see the same upstream timestamp.
 *
 * Existing rows: Postgres casts DATE → TIMESTAMP WITH TIME ZONE at midnight in
 * the session's timezone. We force UTC explicitly so the result is
 * deterministic regardless of who runs the migration.
 *
 * NOTE: ALTER COLUMN TYPE rewrites the column under an ACCESS EXCLUSIVE lock.
 * SecurityPricings is roughly one row per security per day; for typical
 * deployments this is manageable. For very large datasets, plan the window.
 */
export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `ALTER TABLE "SecurityPricings"
         ALTER COLUMN "date" TYPE TIMESTAMP WITH TIME ZONE
         USING ("date"::timestamp AT TIME ZONE 'UTC')`,
    );
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    // Preflight: any non-midnight-UTC rows (crypto intraday) would silently
    // collapse to their UTC calendar date below and then collide on the unique
    // (securityId, date) index, producing a generic constraint violation. Fail
    // with a useful message instead so the operator knows exactly what's in
    // the way before they decide whether to delete the offending rows.
    const rows = (await queryInterface.sequelize.query(
      `SELECT COUNT(*)::text AS count
         FROM "SecurityPricings"
        WHERE "date" <> date_trunc('day', "date" AT TIME ZONE 'UTC')`,
      { type: QueryTypes.SELECT },
    )) as Array<{ count: string }>;
    const intradayCount = Number.parseInt(rows[0]?.count ?? '0', 10);

    if (intradayCount > 0) {
      throw new Error(
        `Cannot revert SecurityPricings.date to DATE: ${intradayCount} row(s) carry intraday timestamps ` +
          `that would collide on the unique (securityId, date) index. Delete the crypto/intraday ` +
          `rows or run the down migration against a fresh database.`,
      );
    }

    await queryInterface.sequelize.query(
      `ALTER TABLE "SecurityPricings"
         ALTER COLUMN "date" TYPE DATE
         USING (("date" AT TIME ZONE 'UTC')::date)`,
    );
  },
};
