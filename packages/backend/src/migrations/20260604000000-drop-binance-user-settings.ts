import { QueryInterface, Transaction } from 'sequelize';

/**
 * Drop the BinanceUserSettings table. The Binance integration was a long-dormant
 * leftover with no entry point in the current UI and no callers in the backend
 * outside its own controller/route. Removing the source files orphaned the table,
 * so drop it to keep the schema in sync with the codebase.
 *
 * The down path recreates the table as it was created in 1623612814388 and
 * re-adds the cascade FK that 20251214000000 attached to userId, so reverting
 * lands on the same schema the table had immediately before this migration ran.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable('BinanceUserSettings');
  },

  down: async (queryInterface: QueryInterface, Sequelize: typeof import('sequelize')): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'BinanceUserSettings',
        {
          id: {
            type: Sequelize.INTEGER,
            unique: true,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
          },
          apiKey: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          secretKey: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          userId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Users',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
        },
        { transaction: t },
      );
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
