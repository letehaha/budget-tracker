module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('TransactionTypes', {
      id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      type: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
    });

    await queryInterface.bulkInsert(
      'TransactionTypes',
      [
        { name: 'Income', type: 1 },
        { name: 'Expense', type: 2 },
        { name: 'Transfer', type: 3 },
      ],
      {},
    );
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('TransactionTypes');
  },
};
