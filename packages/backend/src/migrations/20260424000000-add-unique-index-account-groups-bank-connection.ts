import { QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Dedup any pre-existing duplicate AccountGroups before adding the
      // unique index. The previous findOrCreate({ bankDataProviderConnectionId,
      // userId }) in connect-selected-accounts has been live since
      // 2026-03-15 and is racy under concurrent reconnects/double-clicks, so
      // production may have accumulated rows that would block the index
      // creation below. For each connection: keep the smallest-id group,
      // re-home any AccountGroupings rows from the losers into the keeper
      // (skipping rows that would violate the existing unique(accountId,
      // groupId) constraint), then delete the loser groups.
      await queryInterface.sequelize.query(
        `INSERT INTO "AccountGroupings" ("accountId", "groupId", "createdAt", "updatedAt")
         SELECT DISTINCT ag."accountId", d.keeper_id, NOW(), NOW()
         FROM "AccountGroupings" ag
         JOIN (
           SELECT
             id,
             MIN(id) OVER (PARTITION BY "bankDataProviderConnectionId") AS keeper_id
           FROM "AccountGroups"
           WHERE "bankDataProviderConnectionId" IS NOT NULL
         ) d ON ag."groupId" = d.id AND d.id <> d.keeper_id
         ON CONFLICT ("accountId", "groupId") DO NOTHING`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `DELETE FROM "AccountGroupings"
         WHERE "groupId" IN (
           SELECT id FROM (
             SELECT
               id,
               MIN(id) OVER (PARTITION BY "bankDataProviderConnectionId") AS keeper_id
             FROM "AccountGroups"
             WHERE "bankDataProviderConnectionId" IS NOT NULL
           ) d WHERE id <> keeper_id
         )`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `DELETE FROM "AccountGroups"
         WHERE id IN (
           SELECT id FROM (
             SELECT
               id,
               MIN(id) OVER (PARTITION BY "bankDataProviderConnectionId") AS keeper_id
             FROM "AccountGroups"
             WHERE "bankDataProviderConnectionId" IS NOT NULL
           ) d WHERE id <> keeper_id
         )`,
        { transaction: t },
      );

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
