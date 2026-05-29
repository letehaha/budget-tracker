const mccCodes = require('../resources/mcc-codes.json');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('MerchantCategoryCodes', {
      id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      code: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING(1000),
        allowNull: true,
      },
    });

    await queryInterface.bulkInsert(
      'MerchantCategoryCodes',
      mccCodes.map((code) => ({
        code: code.mcc,
        name: code.edited_description,
        description: code.irs_description,
      })),
      {},
    );
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('MerchantCategoryCodes');
  },
};
