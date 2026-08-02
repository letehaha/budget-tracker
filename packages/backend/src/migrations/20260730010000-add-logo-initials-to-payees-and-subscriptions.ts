import { DataTypes, QueryInterface, Transaction } from 'sequelize';

const TABLES = ['Payees', 'Subscriptions'] as const;

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      for (const table of TABLES) {
        // User-chosen letters rendered instead of a logo.dev image. Capped at 16
        // rather than 2 because a single grapheme (ZWJ emoji, combining marks)
        // can span many code points; the 1-2 grapheme rule is enforced in Zod.
        await queryInterface.addColumn(
          table,
          'logoInitials',
          {
            type: DataTypes.STRING(16),
            allowNull: true,
          },
          { transaction: t },
        );

        // Background fill for the initials, '#rrggbb' lowercase. Only meaningful
        // alongside logoInitials; null there falls back to the primary tint.
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
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
