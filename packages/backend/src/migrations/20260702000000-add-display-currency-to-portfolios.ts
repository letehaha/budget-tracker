import { DataTypes, QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn('Portfolios', 'displayCurrencyCode', {
      type: DataTypes.STRING(3),
      allowNull: true,
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn('Portfolios', 'displayCurrencyCode');
  },
};
