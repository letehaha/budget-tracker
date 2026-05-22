import { DataTypes, QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn('Portfolios', 'deletedAt', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await queryInterface.addIndex('Portfolios', {
      fields: ['deletedAt'],
      name: 'portfolios_deleted_at_idx',
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeIndex('Portfolios', 'portfolios_deleted_at_idx');
    await queryInterface.removeColumn('Portfolios', 'deletedAt');
  },
};
