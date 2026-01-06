import { AbstractQueryInterface } from '@sequelize/core';

/**
 * Migration to add index on externalData.importDetails.batchId for efficient
 * lookup of transactions by import batch ID.
 */
module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    // Add btree index on externalData.importDetails.batchId for batch lookups
    await queryInterface.addIndex('Transactions', {
      fields: [queryInterface.sequelize.literal(`("externalData"->'importDetails'->>'batchId')`)],
      name: 'transactions_external_data_import_batch_id_idx',
      using: 'btree',
    });
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.removeIndex('Transactions', 'transactions_external_data_import_batch_id_idx');
  },
};
