import type { AbstractQueryInterface, Transaction } from '@sequelize/core';
import { DataTypes } from '@sequelize/core';

module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Nullable per-row JSONB used to record who attached a transaction to a shared
      // budget. Owner-attached rows stay NULL (interpreted as "owner"); recipient-
      // attached rows carry `{ "addedByUserId": <recipientId> }` so the budget's
      // detach/sweep logic can distinguish recipient contributions from the owner's
      // own attachments. Shape is intentionally open-ended (JSONB, not a typed column)
      // so future per-row attributes don't need another migration.
      await queryInterface.addColumn(
        'BudgetTransactions',
        'metadata',
        {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: null,
        },
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn('BudgetTransactions', 'metadata', { transaction: t });
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
