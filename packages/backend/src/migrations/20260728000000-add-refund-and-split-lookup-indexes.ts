import { QueryInterface } from 'sequelize';

/**
 * Foreign-key indexes the stats read path depends on.
 *
 * `RefundTransactions.refundTxId` / `.originalTxId` and `TransactionSplits.transactionId` are
 * foreign keys, which Postgres does not index automatically, and neither table is scoped by user in
 * these lookups. Every refund-netting and split-distribution query in the stats services therefore
 * scans the whole table across all users:
 *
 * - `resolveRefundPairs` matches `refundTxId IN (…) OR originalTxId IN (…)`
 * - `computeCategoryAllocations` matches `transactionId IN (…)`
 *
 * The model files declare these indexes, but the INTEGER -> UUID primary-key migration dropped and
 * re-added the columns, which removed the indexes defined on them and never rebuilt them. The
 * declarations are decorative until this runs.
 *
 * The UNIQUE constraints those columns used to carry (`RefundTransactions.refundTxId`,
 * `TransactionSplits(transactionId, categoryId)`) are also gone. Restoring them needs a duplicate
 * sweep first, so they are deliberately left out of this migration.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addIndex('RefundTransactions', ['refundTxId'], {
        name: 'refund_transactions_refund_tx_id_idx',
        transaction: t,
      });

      await queryInterface.addIndex('RefundTransactions', ['originalTxId'], {
        name: 'refund_transactions_original_tx_id_idx',
        transaction: t,
      });

      await queryInterface.addIndex('TransactionSplits', ['transactionId'], {
        name: 'transaction_splits_transaction_id_idx',
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex('RefundTransactions', 'refund_transactions_refund_tx_id_idx', {
        transaction: t,
      });
      await queryInterface.removeIndex('RefundTransactions', 'refund_transactions_original_tx_id_idx', {
        transaction: t,
      });
      await queryInterface.removeIndex('TransactionSplits', 'transaction_splits_transaction_id_idx', {
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
