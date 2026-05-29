import { DataTypes, AbstractQueryInterface, Transaction } from '@sequelize/core';

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      await queryInterface.createTable(
        'TransferSuggestionDismissals',
        {
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { table: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          expenseTransactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { table: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          incomeTransactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { table: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
          },
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
    await queryInterface.dropTable('TransferSuggestionDismissals');
  },
};
