import { QueryInterface } from 'sequelize';

const INDEX_NAME = 'transactions_ofx_account_original_id_unique_idx';

/**
 * Prevent concurrent OFX imports from inserting the same provider transaction
 * twice. Other import and bank-sync sources keep their current ID semantics.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME}
      ON "Transactions" ("accountId", "originalId")
      WHERE "originalId" IS NOT NULL
        AND "externalData"->'importDetails'->>'source' = 'ofx';
    `);
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${INDEX_NAME};`);
  },
};
