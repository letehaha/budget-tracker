/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Update Holdings table
      // 1. Add portfolioId column
      await queryInterface.addColumn(
        'Holdings',
        'portfolioId',
        {
          type: Sequelize.INTEGER,
          allowNull: true, // Initially nullable for migration
          references: {
            model: 'Portfolios',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        { transaction: t },
      );

      // 2. Add index for portfolioId
      await queryInterface.addIndex('Holdings', ['portfolioId'], {
        name: 'holdings_portfolio_id_idx',
        transaction: t,
      });

      // Update InvestmentTransactions table
      // 1. Add portfolioId column
      await queryInterface.addColumn(
        'InvestmentTransactions',
        'portfolioId',
        {
          type: Sequelize.INTEGER,
          allowNull: true, // Initially nullable for migration
          references: {
            model: 'Portfolios',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        { transaction: t },
      );

      // 2. Add index for portfolioId
      await queryInterface.addIndex('InvestmentTransactions', ['portfolioId'], {
        name: 'investment_transactions_portfolio_id_idx',
        transaction: t,
      });

      // Note: We're not dropping accountId columns yet or making portfolioId NOT NULL
      // This will be done in a later migration after data migration is complete
      // For now, both accountId and portfolioId will coexist

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove portfolioId from InvestmentTransactions
      await queryInterface.removeIndex('InvestmentTransactions', 'investment_transactions_portfolio_id_idx', {
        transaction: t,
      });
      await queryInterface.removeColumn('InvestmentTransactions', 'portfolioId', { transaction: t });

      // Remove portfolioId from Holdings
      await queryInterface.removeIndex('Holdings', 'holdings_portfolio_id_idx', { transaction: t });
      await queryInterface.removeColumn('Holdings', 'portfolioId', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
