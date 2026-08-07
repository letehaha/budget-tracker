import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Marks a portfolio transfer that exists to reconcile recorded cash to reality
 * rather than because money crossed the portfolio boundary. Reports that measure
 * "money you added" read this to skip such rows; balance reconstruction ignores
 * it, since an adjustment still moved cash.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'PortfolioTransfers',
        'isAdjustment',
        {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn('PortfolioTransfers', 'isAdjustment');
  },
};
