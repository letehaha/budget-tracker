import { DataTypes, QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn('TransactionTemplates', 'originalCurrencyCode', {
      type: DataTypes.STRING(3),
      allowNull: true,
      defaultValue: null,
      references: { model: 'Currencies', key: 'code' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn('TransactionTemplates', 'originalCurrencyCode');
  },
};
