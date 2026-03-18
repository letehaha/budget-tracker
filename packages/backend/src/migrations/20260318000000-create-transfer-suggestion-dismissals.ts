import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        'TransferSuggestionDismissals',
        {
          userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          expenseTransactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Transactions', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          incomeTransactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'Transactions', key: 'id' },
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

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable('TransferSuggestionDismissals');
  },
};
