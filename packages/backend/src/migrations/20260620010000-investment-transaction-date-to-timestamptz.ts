import { QueryInterface } from 'sequelize';

/**
 * Widen `InvestmentTransactions.date` from DATE to TIMESTAMP WITH TIME ZONE.
 *
 * The column now stores the full timestamp of the trade, so same-day trades
 * order deterministically by their actual time instead of relying on insertion
 * order. Existing date-only rows are mapped to UTC midnight, preserving the
 * calendar day they recorded (production runs UTC).
 *
 * The btree index on `date` is preserved automatically by ALTER COLUMN TYPE —
 * no need to drop/recreate it.
 *
 * NOTE: ALTER COLUMN TYPE rewrites the column under an ACCESS EXCLUSIVE lock.
 * For very large datasets, plan the window.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `ALTER TABLE "InvestmentTransactions"
         ALTER COLUMN "date" TYPE TIMESTAMP WITH TIME ZONE
         USING ("date"::timestamp AT TIME ZONE 'UTC')`,
    );
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `ALTER TABLE "InvestmentTransactions"
         ALTER COLUMN "date" TYPE DATE
         USING (("date" AT TIME ZONE 'UTC')::date)`,
    );
  },
};
