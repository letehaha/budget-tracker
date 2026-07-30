import { QueryInterface, QueryTypes, Transaction } from 'sequelize';

/**
 * Delete the synthetic price rows demo seeding wrote into `SecurityPricings`.
 *
 * `Securities` and `SecurityPricings` carry no user column, so demo seeding
 * resolved onto the same rows real users hold and wrote a monthly price series
 * against them, stamped `source = 'demo'`. The newest of those rows was dated
 * at the instant of the demo signup, which made it win the unscoped
 * `MAX(date)` latest-price lookup for every user on the instance — bitcoin read
 * $67,500 and ethereum $3,500 regardless of the market. The backdated rows are
 * worse: history readers collapse a day to its newest row, so a demo row at
 * mid-afternoon beat the genuine midnight-UTC close for that whole day, and no
 * later sync could overwrite it.
 *
 * `source = 'demo'` is written by nothing else — every real writer stamps a
 * provider name or 'manual-upload' — so it is an exact discriminator.
 *
 * Securities rows are deliberately left alone. They are inert catalog metadata,
 * and `Holdings`, `InvestmentTransactions` and `SecurityPricings` all cascade
 * on delete, so pruning one would destroy real users' holdings and trades.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Securities whose only prices are synthetic. Deleting leaves them with
      // no price at all, and the holdings surface has no cost-basis fallback —
      // it renders $0 and -100%. Clearing `pricingLastSyncedAt` sorts them to
      // the front of the sync queue, which orders by that column NULLS FIRST.
      const stranded = (await queryInterface.sequelize.query(
        `SELECT s.id, s."symbol", s."providerName"
           FROM "Securities" s
           JOIN "SecurityPricings" sp ON sp."securityId" = s.id
          GROUP BY s.id
         HAVING COUNT(*) FILTER (WHERE sp."source" IS DISTINCT FROM 'demo') = 0`,
        { type: QueryTypes.SELECT, transaction: t },
      )) as Array<{ id: string; symbol: string | null; providerName: string }>;

      const [, deleted] = await queryInterface.sequelize.query(
        `DELETE FROM "SecurityPricings" WHERE "source" = 'demo'`,
        { transaction: t },
      );

      if (stranded.length > 0) {
        await queryInterface.sequelize.query(
          `UPDATE "Securities" SET "pricingLastSyncedAt" = NULL WHERE id IN (:ids)`,
          { replacements: { ids: stranded.map((row) => row.id) }, transaction: t },
        );

        // eslint-disable-next-line no-console
        console.warn(
          `[migration 20260730000000] ${stranded.length} securities had only synthetic prices and are now ` +
            `unpriced until the next sync: ${stranded.map((row) => `${row.symbol ?? '?'}/${row.providerName}`).join(', ')}`,
        );
      }

      // eslint-disable-next-line no-console
      console.log(`[migration 20260730000000] Deleted ${JSON.stringify(deleted)} synthetic demo price rows.`);

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  // The deleted rows were synthetic values generated per demo signup, not data
  // any source can reproduce. Throw rather than offer a misleading no-op.
  down: async (): Promise<void> => {
    throw new Error(
      'Reverting 20260730000000-purge-demo-security-prices is not supported: the deleted rows were synthetic.',
    );
  },
};
