module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('UserMerchantCategoryCodes', {
      id: {
        type: Sequelize.INTEGER,
        unique: true,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      categoryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          table: 'Categories',
          key: 'id',
        },
      },
      mccId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          table: 'MerchantCategoryCodes',
          key: 'id',
        },
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          table: 'Users',
          key: 'id',
        },
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('UserMerchantCategoryCodes');
  },
};
