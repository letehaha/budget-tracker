const cc = require('currency-codes');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Currencies', {
      id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      currency: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      digits: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      number: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING,
        allowNull: false,
      },
    });

    const uah = cc.number(980);
    const uahData = {
      code: uah.code,
      number: Number(uah.number),
      digits: uah.digits,
      currency: uah.currency,
    };

    await queryInterface.bulkInsert('Currencies', [uahData], {});
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Currencies');
  },
};
