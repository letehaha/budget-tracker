import { DataTypes, QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn('Securities', 'priceSourceSymbol', {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn('Securities', 'priceSourceSymbol');
  },
};
