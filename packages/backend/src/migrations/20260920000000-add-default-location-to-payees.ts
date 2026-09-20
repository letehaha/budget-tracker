import { DataTypes, QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn('Payees', 'defaultLocation', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn('Payees', 'defaultLocation');
  },
};
