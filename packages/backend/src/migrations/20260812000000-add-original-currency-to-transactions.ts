import { DataTypes, QueryInterface, Transaction } from 'sequelize';

/**
 * Adds the optional "original spend" pair: the amount and ISO 4217 code the user actually
 * paid in, when that differs from both the account currency and the base currency.
 *
 * `originalAmount` stores cents.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'Transactions',
        'originalAmount',
        {
          type: DataTypes.BIGINT,
          allowNull: true,
          defaultValue: null,
        },
        { transaction: t },
      );

      await queryInterface.addColumn(
        'Transactions',
        'originalCurrencyCode',
        {
          type: DataTypes.STRING(3),
          allowNull: true,
          defaultValue: null,
          references: {
            model: 'Currencies',
            key: 'code',
          },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn('Transactions', 'originalCurrencyCode', { transaction: t });
      await queryInterface.removeColumn('Transactions', 'originalAmount', { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
