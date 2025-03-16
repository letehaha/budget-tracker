module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('TransactionEntities', {
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
        type: Sequelize.STRING,
        allowNull: false,
      },
    });

    await queryInterface.bulkInsert(
      'TransactionEntities',
      [
        { name: 'System', type: 'system' },
        { name: 'Monobank', type: 'monobank' },
      ],
      {},
    );
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('TransactionEntities');
  },
};
