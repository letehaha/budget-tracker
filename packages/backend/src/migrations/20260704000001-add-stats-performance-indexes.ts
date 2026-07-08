import { QueryInterface } from 'sequelize';

/**
 * Read-path indexes for the stats and investments endpoints.
 *
 * - Transactions(userId, time): the stats endpoints (cash-flow, balance
 *   history, cumulative data, expenses history, spendings-by-category) filter
 *   by userId (equality) plus a time range. The nearest existing index is
 *   (userId, payeeId, time): payeeId sits between the two constrained columns
 *   and is left unbounded by these queries, so time cannot serve as a range
 *   bound and Postgres walks the whole per-user index. This composite lets it
 *   bound directly on the requested [from, to] window.
 * - Transactions(accountId, time): the account-details transaction list filters
 *   by accountId (equality, or a small IN-list) and orders by (time, id).
 *   accountId is a foreign key with no index, so account-scoped fetches and the
 *   bank-sync `findAll({ where: { accountId } })` reconciliation queries walk the
 *   whole table. This composite bounds the filter and serves the time ordering.
 * - Accounts(userId): userId is a foreign key with no index (Postgres does not
 *   auto-index foreign keys), so per-user account lookups and the
 *   Balances -> Accounts join scan every user's accounts.
 * - InvestmentTransactions(portfolioId, date, createdAt): the holdings and
 *   balance-history replays filter by portfolioId and order by (date,
 *   createdAt). No index covers portfolioId, so the filter is a sequential
 *   scan followed by an in-memory sort; this composite serves both.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addIndex('Transactions', ['userId', 'time'], {
        name: 'transactions_user_id_time_idx',
        transaction: t,
      });

      await queryInterface.addIndex('Transactions', ['accountId', 'time'], {
        name: 'transactions_account_id_time_idx',
        transaction: t,
      });

      await queryInterface.addIndex('Accounts', ['userId'], {
        name: 'accounts_user_id_idx',
        transaction: t,
      });

      await queryInterface.addIndex('InvestmentTransactions', ['portfolioId', 'date', 'createdAt'], {
        name: 'investment_transactions_portfolio_id_date_created_at_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex('Transactions', 'transactions_user_id_time_idx', { transaction: t });
      await queryInterface.removeIndex('Transactions', 'transactions_account_id_time_idx', { transaction: t });
      await queryInterface.removeIndex('Accounts', 'accounts_user_id_idx', { transaction: t });
      await queryInterface.removeIndex(
        'InvestmentTransactions',
        'investment_transactions_portfolio_id_date_created_at_idx',
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
