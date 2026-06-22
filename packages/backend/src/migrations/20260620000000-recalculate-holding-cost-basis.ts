import { Big } from 'big.js';
import { QueryInterface, QueryTypes } from 'sequelize';

/**
 * Recomputes every Holding's persisted cost basis from its transactions using
 * the corrected (date, createdAt) replay ordering.
 *
 * `Holdings.costBasis` / `refCostBasis` are stored columns, rewritten only when a
 * transaction is created/updated/deleted on that holding. A row last written
 * before the replay-ordering fix can carry an inflated basis: a same-day wash
 * sale (sell the whole position, then rebuy it) blended the liquidated lots into
 * the basis instead of resetting it, because the same-day SELL/BUY pair had no
 * deterministic order under the DATEONLY `date` column alone.
 *
 * This backfill replays each holding's transactions in (date, createdAt) order
 * and overwrites `costBasis` / `refCostBasis`. `quantity` is a straight signed
 * sum — order-independent and already correct — so it is left untouched.
 *
 * NOTES:
 * - The fold inlines `computeHoldingTotals` (holding-totals.ts) as a frozen copy
 *   driven by raw SQL: the production image ships only `dist/` + `src/migrations`,
 *   not the service/model layer, so the migration cannot import app code (and a
 *   migration must not depend on app code that may later change).
 * - Each holding is recalculated in its own try/catch. A failure on one holding
 *   is logged and skipped rather than thrown, so a single bad row cannot abort
 *   the migration — which would halt the whole deploy via the entrypoint.
 * - `down` is a no-op: the pre-fix values were incorrect and are not worth
 *   restoring.
 */

const BUY = 'buy';
const SELL = 'sell';

interface HoldingRow {
  portfolioId: string;
  securityId: string;
}

interface TransactionRow {
  category: string;
  quantity: string;
  amount: string;
  refAmount: string;
}

/**
 * Folds a holding's transactions (in chronological order) into its current cost
 * basis. Cost basis tracks the cost of the *current long position* only: a SELL
 * that drains the position to zero resets it, so a same-day wash sale keeps only
 * the rebuy lot. Mirrors `computeHoldingTotals`; only BUY and SELL affect the
 * basis, every other category is a no-op.
 */
function foldCostBasis({ transactions }: { transactions: TransactionRow[] }): {
  costBasis: Big;
  refCostBasis: Big;
} {
  let quantity = new Big(0);
  let costBasis = new Big(0);
  let refCostBasis = new Big(0);

  for (const tx of transactions) {
    const legQuantity = new Big(tx.quantity);
    const amount = new Big(tx.amount);
    const refAmount = new Big(tx.refAmount);

    if (tx.category === BUY) {
      const newQuantity = quantity.plus(legQuantity);
      if (newQuantity.lte(0)) {
        // Still short after the buy — no long position to attribute cost to.
        costBasis = new Big(0);
        refCostBasis = new Big(0);
      } else if (quantity.lte(0)) {
        // Crosses from short/zero into long; only the portion above zero is new
        // long basis, the rest covered the short.
        const longProportion = newQuantity.div(legQuantity);
        costBasis = amount.times(longProportion);
        refCostBasis = refAmount.times(longProportion);
      } else {
        costBasis = costBasis.plus(amount);
        refCostBasis = refCostBasis.plus(refAmount);
      }
      quantity = newQuantity;
    } else if (tx.category === SELL) {
      if (quantity.gt(0)) {
        const newQuantity = quantity.minus(legQuantity);
        if (newQuantity.lte(0)) {
          costBasis = new Big(0);
          refCostBasis = new Big(0);
        } else {
          const remainingProportion = newQuantity.div(quantity);
          costBasis = costBasis.times(remainingProportion);
          refCostBasis = refCostBasis.times(remainingProportion);
        }
      }
      // Selling from a zero/short position leaves the basis untouched.
      quantity = quantity.minus(legQuantity);
    }
  }

  return {
    costBasis: costBasis.lt(0) ? new Big(0) : costBasis,
    refCostBasis: refCostBasis.lt(0) ? new Big(0) : refCostBasis,
  };
}

module.exports = {
  // Exported only so a unit test can assert this frozen fold stays identical to
  // the live `computeHoldingTotals`. The migration runner ignores extra keys.
  foldCostBasis,
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;

    const holdings = await sequelize.query<HoldingRow>(`SELECT "portfolioId", "securityId" FROM "Holdings"`, {
      type: QueryTypes.SELECT,
    });

    let updated = 0;
    const failedHoldings: string[] = [];

    for (const holding of holdings) {
      try {
        const transactions = await sequelize.query<TransactionRow>(
          `SELECT "category", "quantity", "amount", "refAmount"
           FROM "InvestmentTransactions"
           WHERE "portfolioId" = :portfolioId AND "securityId" = :securityId
           ORDER BY "date" ASC, "createdAt" ASC`,
          {
            replacements: { portfolioId: holding.portfolioId, securityId: holding.securityId },
            type: QueryTypes.SELECT,
          },
        );

        const { costBasis, refCostBasis } = foldCostBasis({ transactions });

        await sequelize.query(
          `UPDATE "Holdings"
           SET "costBasis" = :costBasis, "refCostBasis" = :refCostBasis, "updatedAt" = NOW()
           WHERE "portfolioId" = :portfolioId AND "securityId" = :securityId`,
          {
            replacements: {
              costBasis: costBasis.toFixed(10),
              refCostBasis: refCostBasis.toFixed(10),
              portfolioId: holding.portfolioId,
              securityId: holding.securityId,
            },
            type: QueryTypes.UPDATE,
          },
        );
        updated += 1;
      } catch (error) {
        failedHoldings.push(`${holding.portfolioId}/${holding.securityId}`);
        if (process.env.NODE_ENV !== 'test') {
          console.error(`Failed to recalculate holding ${holding.portfolioId}/${holding.securityId}:`, error);
        }
      }
    }

    if (process.env.NODE_ENV !== 'test') {
      if (failedHoldings.length > 0) {
        // Loud + greppable: these holdings still carry the stale, pre-fix cost
        // basis this migration was meant to correct, and the migration is marked
        // applied regardless — surface them as one block so they can be retargeted.
        console.error(
          `Holding cost basis recalculation: ${updated} updated, ${failedHoldings.length} FAILED. ` +
            `Stale cost basis remains on (portfolioId/securityId): ${failedHoldings.join(', ')}`,
        );
      } else {
        console.log(`Holding cost basis recalculation complete: ${updated} updated, 0 failed`);
      }
    }
  },

  down: async (): Promise<void> => {
    // No-op: the pre-fix cost basis values were incorrect and are not restored.
  },
};
