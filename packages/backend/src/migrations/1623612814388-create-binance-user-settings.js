module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('BinanceUserSettings', {
      id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      apiKey: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      secretKey: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('BinanceUserSettings');
  },
};
