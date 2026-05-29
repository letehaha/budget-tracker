import { DataTypes, AbstractQueryInterface, Transaction } from '@sequelize/core';

/**
 * Migration to add createdAt and updatedAt columns to Transactions table.
 * - createdAt: defaults to the transaction's `time` field (when the transaction occurred)
 * - updatedAt: defaults to NOW()
 */
export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // Step 1: Add columns as nullable
      await queryInterface.addColumn(
        'Transactions',
        'createdAt',
        {
          type: DataTypes.DATE,
          allowNull: true,
        },
        { transaction: t },
      );

      await queryInterface.addColumn(
        'Transactions',
        'updatedAt',
        {
          type: DataTypes.DATE,
          allowNull: true,
        },
        { transaction: t },
      );

      // Step 2: Populate existing records
      await queryInterface.sequelize.query('UPDATE "Transactions" SET "createdAt" = "time", "updatedAt" = NOW()', {
        transaction: t,
      });

      // Step 3: Set columns to NOT NULL
      await queryInterface.changeColumn(
        'Transactions',
        'createdAt',
        {
          type: DataTypes.DATE,
          allowNull: false,
        },
        { transaction: t },
      );

      await queryInterface.changeColumn(
        'Transactions',
        'updatedAt',
        {
          type: DataTypes.DATE,
          allowNull: false,
        },
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.removeColumn('Transactions', 'createdAt', { transaction: t });
      await queryInterface.removeColumn('Transactions', 'updatedAt', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
