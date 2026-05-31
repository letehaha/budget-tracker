import type { AbstractQueryInterface } from '@sequelize/core';
import { DataTypes } from '@sequelize/core';

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.addColumn('Securities', 'logoUrl', {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.removeColumn('Securities', 'logoUrl');
  },
};
