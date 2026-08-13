import { describe, expect, it } from '@jest/globals';
import { connection } from '@models/index';

import { REAL_TRANSACTIONS_VIEW } from '../../migrations/utils/real-transactions-view';

/**
 * Postgres pins a view's column list at creation, so a migration that adds a column to
 * "Transactions" without rebuilding the view leaves it silently short a column, and raw SQL
 * reading through it sees stale schema. Nothing in TypeScript can catch that, so this test
 * is the guard: it fails on the first migration that adds a column and skips the rebuild.
 * The fix is to re-run `createRealTransactionsViewSql` at the end of that migration.
 */
const columnsOf = async (relation: string): Promise<string[]> => {
  const [rows] = (await connection.sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :relation
     ORDER BY column_name`,
    { replacements: { relation } },
  )) as unknown as [{ column_name: string }[], unknown];

  return rows.map((row) => row.column_name);
};

describe('real_transactions view', () => {
  it('exposes every column of "Transactions"', async () => {
    const [tableColumns, viewColumns] = await Promise.all([
      columnsOf('Transactions'),
      columnsOf(REAL_TRANSACTIONS_VIEW),
    ]);

    expect(tableColumns.length).toBeGreaterThan(0);
    expect(viewColumns).toEqual(tableColumns);
  });
});
