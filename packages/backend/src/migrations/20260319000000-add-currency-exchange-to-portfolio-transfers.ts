import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn('PortfolioTransfers', 'toCurrencyCode', {
      type: DataTypes.STRING(3),
      allowNull: true,
      defaultValue: null,
      references: {
        model: 'Currencies',
        key: 'code',
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addColumn('PortfolioTransfers', 'toAmount', {
      type: DataTypes.DECIMAL(20, 10),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('PortfolioTransfers', 'refToAmount', {
      type: DataTypes.DECIMAL(20, 10),
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn('PortfolioTransfers', 'refToAmount');
    await queryInterface.removeColumn('PortfolioTransfers', 'toAmount');
    await queryInterface.removeColumn('PortfolioTransfers', 'toCurrencyCode');
  },
};
