import { QueryInterface } from 'sequelize';

/**
 * Re-tags transactions imported from the BudgetBakers Wallet importer so their
 * persisted provider id matches the renamed `ImportSource` enum value: the
 * `externalData.importDetails.source` JSONB field holds `budget-bakers-wallet`
 * instead of the generic `wallet`. Only rows that already carry the old value
 * are touched; rows with a missing/NULL source path are filtered out by the
 * WHERE clause, so the bulk update is safe and idempotent.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`
      UPDATE "Transactions"
      SET "externalData" = jsonb_set("externalData", '{importDetails,source}', '"budget-bakers-wallet"')
      WHERE "externalData"->'importDetails'->>'source' = 'wallet';
    `);
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`
      UPDATE "Transactions"
      SET "externalData" = jsonb_set("externalData", '{importDetails,source}', '"wallet"')
      WHERE "externalData"->'importDetails'->>'source' = 'budget-bakers-wallet';
    `);
  },
};
