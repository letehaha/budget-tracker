/* eslint-disable @typescript-eslint/no-explicit-any */
import { DataTypes, AbstractQueryInterface, Transaction } from '@sequelize/core';

/**
 * Migration to remove deprecated value and refValue columns from Holdings table.
 * These fields were deprecated in favor of dynamic calculation (quantity × latest price).
 */
module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.removeColumn('Holdings', 'value', { transaction: t });
      await queryInterface.removeColumn('Holdings', 'refValue', { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.addColumn(
        'Holdings',
        'value',
        {
          type: DataTypes.DECIMAL(20, 10),
          allowNull: false,
          defaultValue: '0',
        },
        { transaction: t },
      );

      await queryInterface.addColumn(
        'Holdings',
        'refValue',
        {
          type: DataTypes.DECIMAL(20, 10),
          allowNull: false,
          defaultValue: '0',
        },
        { transaction: t },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
