module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('UsersCurrencies', {
      id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
      },
      currencyId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Currencies',
          key: 'id',
        },
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('UsersCurrencies');
  },
};
