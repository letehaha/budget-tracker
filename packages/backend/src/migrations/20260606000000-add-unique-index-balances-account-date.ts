import { QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t = await queryInterface.sequelize.transaction();

    try {
      // Dedup any pre-existing duplicate Balances rows before adding the
      // unique index. `Balances.updateAccountBalance` has been live with a
      // `findOne → save | create` body that is racy under concurrent writes,
      // and the `@AfterCreate` per-transaction hook (Balances.handleTransactionChange
      // for Monobank / EnableBanking accounts) calls it once per tx — concurrent
      // syncs (auto + manual, multi-batch BullMQ workers, the Bottleneck-parallel
      // sync-manager fan-out) routinely race for the same (accountId, date) and
      // produce duplicates that would block the index creation below.
      //
      // Per (accountId, date) group, keep the row with the newest `updatedAt`,
      // tiebreak by newest `createdAt`, then by the smallest UUID for a
      // deterministic outcome. The newest `updatedAt` matches the semantics of
      // the upsert that replaces the racy method body — last writer wins.
      await queryInterface.sequelize.query(
        `DELETE FROM "Balances"
         WHERE id IN (
           SELECT id FROM (
             SELECT
               id,
               ROW_NUMBER() OVER (
                 PARTITION BY "accountId", "date"
                 ORDER BY "updatedAt" DESC, "createdAt" DESC, id ASC
               ) AS rn
             FROM "Balances"
           ) ranked
           WHERE rn > 1
         )`,
        { transaction: t },
      );

      // At most one Balances row per (accountId, date). Required to make the
      // `Balances.updateAccountBalance` upsert path (and the catch+retry
      // fallback in `Balances.updateBalanceIncremental`) race-safe via
      // `ON CONFLICT ("accountId", "date") DO UPDATE`.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "balances_account_id_date_unique"
         ON "Balances" ("accountId", "date")`,
        { transaction: t },
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS "balances_account_id_date_unique"', {
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
