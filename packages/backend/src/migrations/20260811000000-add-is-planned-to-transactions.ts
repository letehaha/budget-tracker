import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Adds `isPlanned` for planned transactions: rows a user enters before the money moves.
 * The partial index covers only planned rows so the planned matcher, the planned-summary
 * endpoint, and the upcoming card can query them without a date bound.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'Transactions',
        'isPlanned',
        {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction: t },
      );

      await queryInterface.addIndex('Transactions', ['accountId', 'time'], {
        name: 'transactions_planned_account_time_idx',
        where: { isPlanned: true },
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeIndex('Transactions', 'transactions_planned_account_time_idx', { transaction: t });

      await queryInterface.removeColumn('Transactions', 'isPlanned', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
