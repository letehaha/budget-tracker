module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('MonobankTransactions', 'transactionEntityId', {
      type: Sequelize.INTEGER,
      references: {
        model: 'TransactionEntities',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('Transactions', 'transactionEntityId', {
      type: Sequelize.INTEGER,
      references: {
        model: 'TransactionEntities',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('MonobankTransactions', 'transactionEntityId');
    await queryInterface.removeColumn('Transactions', 'transactionEntityId');
  },
};
