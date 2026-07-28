import { QueryInterface } from 'sequelize';

/**
 * Rebuilds the RefundTransactions / TransactionSplits indexes that the INTEGER -> UUID
 * primary-key migration silently destroyed.
 *
 * That migration dropped and re-added each foreign-key column and only restored the FOREIGN KEY
 * constraint; Postgres drops indexes defined solely on a dropped column, so everything the two
 * create-table migrations declared went with them. The model files still describe the old schema.
 *
 * Two consequences:
 *
 * - Performance. Neither table is scoped by user in the stats read path, so every refund-netting
 *   and split-distribution query (`resolveRefundPairs`, `computeCategoryAllocations`) scans the
 *   whole table across all users.
 * - Integrity. `UNIQUE(refundTxId)` and `UNIQUE(transactionId, categoryId)` were both lost, so one
 *   refund transaction can be linked to several originals and one transaction can carry several
 *   split rows for the same category. Both corrupt reporting: duplicate splits inflate that
 *   category's spend, and `manage-splits` keys its refund relinking by categoryId, so it silently
 *   repoints refunds to whichever duplicate it iterated last.
 *
 * Restoring the UNIQUEs needs the existing duplicates resolved first, which is what the sweep below
 * does. Split duplicates are folded into the surviving row rather than deleted, because each
 * duplicate holds real money; refund duplicates are plain link rows, so the earliest link wins
 * (matching `createSingleRefund`, which rejects any later attempt to re-link the same refund).
 *
 * Last, it tightens `RefundTransactions.originalTxId` from ON DELETE SET NULL to CASCADE — see the
 * comment at that statement. Existing rows already nulled by the old rule are left alone: nothing
 * distinguishes them from refunds the user legitimately recorded against an untracked purchase.
 *
 * Every statement is idempotent so a database that already ran an earlier revision of this file
 * converges to the same schema.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t = await queryInterface.sequelize.transaction();
    try {
      const query = (sql: string) => queryInterface.sequelize.query(sql, { transaction: t });

      // --- Sweep: fold duplicate splits into the oldest row of their (transaction, category) ---
      // TransactionSplits has no timestamps, so the uuid ordering is the only stable tiebreak.
      await query(`
        CREATE TEMP TABLE split_dupe_map ON COMMIT DROP AS
        SELECT id AS loser_id,
               FIRST_VALUE(id) OVER (PARTITION BY "transactionId", "categoryId" ORDER BY id) AS keeper_id
        FROM "TransactionSplits";
      `);
      await query(`DELETE FROM split_dupe_map WHERE loser_id = keeper_id;`);

      await query(`
        UPDATE "TransactionSplits" keeper
        SET amount = keeper.amount + folded.amount,
            "refAmount" = keeper."refAmount" + folded."refAmount"
        FROM (
          SELECT m.keeper_id, SUM(s.amount) AS amount, SUM(s."refAmount") AS "refAmount"
          FROM split_dupe_map m
          JOIN "TransactionSplits" s ON s.id = m.loser_id
          GROUP BY m.keeper_id
        ) folded
        WHERE keeper.id = folded.keeper_id;
      `);

      // splitId is ON DELETE SET NULL, so a split-targeted refund would silently lose its target.
      await query(`
        UPDATE "RefundTransactions" r
        SET "splitId" = m.keeper_id
        FROM split_dupe_map m
        WHERE r."splitId" = m.loser_id;
      `);

      await query(`DELETE FROM "TransactionSplits" WHERE id IN (SELECT loser_id FROM split_dupe_map);`);

      // --- Sweep: keep the first link made for each refund transaction ---
      await query(`
        CREATE TEMP TABLE refund_dupe_map ON COMMIT DROP AS
        SELECT id AS loser_id,
               FIRST_VALUE(id) OVER (PARTITION BY "refundTxId" ORDER BY "createdAt", id) AS keeper_id
        FROM "RefundTransactions";
      `);
      await query(`DELETE FROM refund_dupe_map WHERE loser_id = keeper_id;`);
      await query(`DELETE FROM "RefundTransactions" WHERE id IN (SELECT loser_id FROM refund_dupe_map);`);

      // --- Sweep: realign refundLinked with the links that survived ---
      // Runs after the deletes above so it reads the final set of links. The flag decides whether
      // the reporting engines even look a transaction's refunds up, so both directions matter:
      // a stale true costs a wasted lookup, a stale false makes a real refund stop netting and the
      // expense reports overstate. Removing one of a purchase's several refunds used to clear the
      // purchase's flag outright, and nothing set it back.
      await query(`
        CREATE TEMP TABLE linked_tx_ids ON COMMIT DROP AS
        SELECT "refundTxId" AS id FROM "RefundTransactions"
        UNION
        SELECT "originalTxId" AS id FROM "RefundTransactions" WHERE "originalTxId" IS NOT NULL;
      `);
      await query(`CREATE INDEX ON linked_tx_ids (id);`);

      await query(`
        UPDATE "Transactions" t
        SET "refundLinked" = true
        FROM linked_tx_ids l
        WHERE l.id = t.id AND t."refundLinked" = false;
      `);
      await query(`
        UPDATE "Transactions" t
        SET "refundLinked" = false
        WHERE t."refundLinked" = true
          AND NOT EXISTS (SELECT 1 FROM linked_tx_ids l WHERE l.id = t.id);
      `);

      // --- Rebuild the indexes ---
      await query(
        `CREATE INDEX IF NOT EXISTS transaction_splits_transaction_id_idx ON "TransactionSplits" ("transactionId");`,
      );
      await query(
        `CREATE INDEX IF NOT EXISTS transaction_splits_category_id_idx ON "TransactionSplits" ("categoryId");`,
      );
      await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS transaction_splits_tx_category_idx ON "TransactionSplits" ("transactionId", "categoryId");`,
      );
      await query(
        `CREATE INDEX IF NOT EXISTS refund_transactions_original_tx_id_idx ON "RefundTransactions" ("originalTxId");`,
      );
      // An earlier revision of this file created this column's index without UNIQUE; drop it so the
      // unique one below is what a converging database ends up with.
      await query(`DROP INDEX IF EXISTS refund_transactions_refund_tx_id_idx;`);
      await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS refund_transactions_refund_tx_id_unique_idx ON "RefundTransactions" ("refundTxId");`,
      );

      // --- originalTxId: SET NULL -> CASCADE ---
      // A null originalTxId means the refund covers a purchase the user never tracked, so SET NULL
      // rewrote "refund of this purchase" into a claim about the user's accounts that nothing can
      // undo: the report engine reads the row as plain income, and the row keeps occupying that
      // refund's UNIQUE(refundTxId) slot. Deleting the purchase should take the link with it.
      // `deleteTransaction` clears the links itself, so this rule is what covers every other way a
      // transaction disappears — deleting an account cascades into its transactions, and several
      // services delete rows directly.
      await query(`ALTER TABLE "RefundTransactions" DROP CONSTRAINT IF EXISTS "RefundTransactions_originalTxId_fkey";`);
      await query(`
        ALTER TABLE "RefundTransactions"
        ADD CONSTRAINT "RefundTransactions_originalTxId_fkey"
        FOREIGN KEY ("originalTxId") REFERENCES "Transactions" (id) ON UPDATE CASCADE ON DELETE CASCADE;
      `);

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  // Only the indexes come back off. The duplicate sweep merged and deleted rows and is not
  // reversible; rolling back leaves that data as the sweep left it.
  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t = await queryInterface.sequelize.transaction();
    try {
      const query = (sql: string) => queryInterface.sequelize.query(sql, { transaction: t });

      await query(`DROP INDEX IF EXISTS transaction_splits_transaction_id_idx;`);
      await query(`DROP INDEX IF EXISTS transaction_splits_category_id_idx;`);
      await query(`DROP INDEX IF EXISTS transaction_splits_tx_category_idx;`);
      await query(`DROP INDEX IF EXISTS refund_transactions_original_tx_id_idx;`);
      await query(`DROP INDEX IF EXISTS refund_transactions_refund_tx_id_unique_idx;`);

      await query(`ALTER TABLE "RefundTransactions" DROP CONSTRAINT IF EXISTS "RefundTransactions_originalTxId_fkey";`);
      await query(`
        ALTER TABLE "RefundTransactions"
        ADD CONSTRAINT "RefundTransactions_originalTxId_fkey"
        FOREIGN KEY ("originalTxId") REFERENCES "Transactions" (id) ON DELETE SET NULL;
      `);

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
