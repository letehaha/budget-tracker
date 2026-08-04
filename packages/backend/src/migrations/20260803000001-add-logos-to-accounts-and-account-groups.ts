import { DataTypes, QueryInterface, Transaction } from 'sequelize';

const TABLES = ['Accounts', 'AccountGroups'] as const;

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      for (const table of TABLES) {
        await queryInterface.addColumn(
          table,
          'logoDomain',
          {
            type: DataTypes.STRING(253),
            allowNull: true,
          },
          { transaction: t },
        );

        await queryInterface.addColumn(
          table,
          'logoInitials',
          {
            type: DataTypes.STRING(16),
            allowNull: true,
          },
          { transaction: t },
        );

        await queryInterface.addColumn(
          table,
          'logoColor',
          {
            type: DataTypes.STRING(7),
            allowNull: true,
          },
          { transaction: t },
        );
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      for (const table of TABLES) {
        await queryInterface.removeColumn(table, 'logoColor', { transaction: t });
        await queryInterface.removeColumn(table, 'logoInitials', { transaction: t });
        await queryInterface.removeColumn(table, 'logoDomain', { transaction: t });
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
