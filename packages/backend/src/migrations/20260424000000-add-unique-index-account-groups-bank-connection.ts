import { QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Partial unique index: at most one AccountGroup per bank connection.
      // Partial (WHERE NOT NULL) because the column is nullable for non-bank groups.
      // Required to make findOrCreate races safe in connect-selected-accounts.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "account_groups_bank_data_provider_connection_id_unique"
         ON "AccountGroups" ("bankDataProviderConnectionId")
         WHERE "bankDataProviderConnectionId" IS NOT NULL`,
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
      await queryInterface.sequelize.query(
        'DROP INDEX IF EXISTS "account_groups_bank_data_provider_connection_id_unique"',
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
