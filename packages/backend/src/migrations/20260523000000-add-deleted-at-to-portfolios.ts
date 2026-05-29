import type { AbstractQueryInterface } from '@sequelize/core';
import { DataTypes } from '@sequelize/core';

module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.addColumn('Portfolios', 'deletedAt', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await queryInterface.addIndex('Portfolios', {
      fields: ['deletedAt'],
      name: 'portfolios_deleted_at_idx',
    });
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.removeIndex('Portfolios', 'portfolios_deleted_at_idx');
    await queryInterface.removeColumn('Portfolios', 'deletedAt');
  },
};
