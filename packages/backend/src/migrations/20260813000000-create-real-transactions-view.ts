import { QueryInterface } from 'sequelize';

import { createRealTransactionsViewSql, dropRealTransactionsViewSql } from './utils/real-transactions-view';

/**
 * Planned-free view of "Transactions" for raw SQL, which no TS-level boundary can police.
 * Postgres pins the view's column list at creation, so migrations touching "Transactions"
 * must maintain it: one adding a column re-runs `createRealTransactionsViewSql` at the end
 * or the column is absent here, and ALTER COLUMN ... TYPE / DROP COLUMN are refused outright
 * until `dropRealTransactionsViewSql` runs first. Both live in ./utils/real-transactions-view,
 * and models/transactions-query/real-transactions-view-columns.e2e.ts fails when an added
 * column goes missing here.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(createRealTransactionsViewSql);
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(dropRealTransactionsViewSql);
  },
};
