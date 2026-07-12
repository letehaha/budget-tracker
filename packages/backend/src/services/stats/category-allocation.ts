import { TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import RefundTransactions from '@models/refund-transactions.model';
import TransactionSplits from '@models/transaction-splits.model';
import Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

/**
 * The category-spend allocation engine shared by the spendings-by-categories and pivot reports.
 *
 * Given a set of expense transactions it produces a flat list of signed, date-stamped
 * contributions to categories:
 *
 * - Split transactions distribute across their categories — the primary category gets
 *   `tx.refAmount − Σ splits` (only when positive), each split its own `split.refAmount`.
 * - Refunds net cash-basis: a refund emits a negative leg at the refunded category, stamped with
 *   the *refund tx's* own date (so it lands in the bucket the money came back in). The refunded
 *   category is the targeted split's category, else the original expense's category.
 *
 * The engine stays grouping-agnostic: legs are keyed by the exact `categoryId` (null = the
 * uncategorized residual). Each consumer maps that to its own grouping key (root category,
 * selected ancestor, exact subcategory) and decides whether to keep the time axis. Refund legs
 * are returned separately so a consumer can drop a refund whose category never received any base
 * spend in range (avoids phantom negative rows for out-of-range originals).
 */

/** Minimal transaction shape the engine needs; both stats consumers already load these columns. */
interface AllocatableTransaction {
  id: string;
  refAmount: Money;
  categoryId: string | null;
  transactionType: TRANSACTION_TYPES;
  time: Date | string;
  refundLinked: boolean;
}

/** One signed contribution to a category, stamped with the date it should be attributed to. */
export interface CategoryAllocationLeg {
  /** Exact category id, or null for the uncategorized residual. */
  categoryId: string | null;
  /** Base legs are positive; refund legs are negative. Integer cents (base/reference currency). */
  cents: number;
  /** Base legs use the transaction's own date; refund legs use the refund tx's date. */
  time: Date;
}

export interface CategoryAllocations {
  /** Positive spend, one leg per (primary/split) contribution. */
  base: CategoryAllocationLeg[];
  /** Negative refund adjustments; empty when `applyRefunds` is false or nothing is refunded. */
  refunds: CategoryAllocationLeg[];
}

interface TxEntry {
  refAmount: Money;
  categoryId: string | null;
  transactionType: TRANSACTION_TYPES;
  time: Date;
}

export const computeCategoryAllocations = async ({
  transactions,
  applyRefunds,
}: {
  transactions: AllocatableTransaction[];
  /** Refunds only offset expenses; an income report's "refund" leg is itself the income. */
  applyRefunds: boolean;
}): Promise<CategoryAllocations> => {
  const txIds = transactions.map((tx) => tx.id);

  const txMap = new Map<string, TxEntry>();
  for (const tx of transactions) {
    txMap.set(tx.id, {
      refAmount: tx.refAmount,
      categoryId: tx.categoryId,
      transactionType: tx.transactionType,
      time: new Date(tx.time),
    });
  }

  let refunds: RefundTransactions[] = [];
  const splitIdsToFetch = new Set<string>();

  if (applyRefunds) {
    const txIdsWithRefunds = transactions.filter((tx) => tx.refundLinked).map((tx) => tx.id);
    if (txIdsWithRefunds.length > 0) {
      refunds = await RefundTransactions.findAll({
        where: {
          [Op.or]: [{ refundTxId: { [Op.in]: txIdsWithRefunds } }, { originalTxId: { [Op.in]: txIdsWithRefunds } }],
        },
      });

      // A refund's original/refund tx can sit outside the report window (e.g. bought last month,
      // refunded this month). Pull those in so the netting can resolve them.
      const missingTxIds = new Set<string>();
      for (const refund of refunds) {
        if (refund.originalTxId && !txMap.has(refund.originalTxId)) missingTxIds.add(refund.originalTxId);
        if (!txMap.has(refund.refundTxId)) missingTxIds.add(refund.refundTxId);
        if (refund.splitId) splitIdsToFetch.add(refund.splitId);
      }

      if (missingTxIds.size > 0) {
        const missingTxs = await Transactions.findAll({
          where: { id: { [Op.in]: [...missingTxIds] } },
          attributes: ['id', 'refAmount', 'categoryId', 'transactionType', 'time'],
        });
        for (const tx of missingTxs) {
          txMap.set(tx.id, {
            refAmount: tx.refAmount,
            categoryId: tx.categoryId,
            transactionType: tx.transactionType,
            time: new Date(tx.time),
          });
        }
      }
    }
  }

  const splitsByTxId = new Map<string, TransactionSplits[]>();
  const splitsById = new Map<string, TransactionSplits>();
  const splits = await TransactionSplits.findAll({
    where: {
      [Op.or]: [
        { transactionId: { [Op.in]: txIds } },
        ...(splitIdsToFetch.size > 0 ? [{ id: { [Op.in]: [...splitIdsToFetch] } }] : []),
      ],
    },
  });
  for (const split of splits) {
    const existing = splitsByTxId.get(split.transactionId) ?? [];
    existing.push(split);
    splitsByTxId.set(split.transactionId, existing);
    splitsById.set(split.id, split);
  }

  const base: CategoryAllocationLeg[] = [];
  for (const tx of transactions) {
    const time = new Date(tx.time);
    const txSplits = splitsByTxId.get(tx.id);
    if (txSplits && txSplits.length > 0) {
      const splitsTotal = txSplits.reduce((sum, split) => sum + split.refAmount.toCents(), 0);
      const primaryAmount = tx.refAmount.toCents() - splitsTotal;
      if (primaryAmount > 0) base.push({ categoryId: tx.categoryId, cents: primaryAmount, time });
      for (const split of txSplits) base.push({ categoryId: split.categoryId, cents: split.refAmount.toCents(), time });
    } else {
      base.push({ categoryId: tx.categoryId, cents: tx.refAmount.toCents(), time });
    }
  }

  const refundLegs: CategoryAllocationLeg[] = [];
  for (const refund of refunds) {
    if (!refund.originalTxId) continue;
    const baseTx = txMap.get(refund.originalTxId);
    const refundTx = txMap.get(refund.refundTxId);
    if (!baseTx || !refundTx) continue;

    let refundedCategoryId: string | null;
    if (refund.splitId) {
      const targetSplit = splitsById.get(refund.splitId);
      refundedCategoryId = targetSplit ? targetSplit.categoryId : baseTx.categoryId;
    } else {
      refundedCategoryId =
        baseTx.transactionType === TRANSACTION_TYPES.expense ? baseTx.categoryId : refundTx.categoryId;
    }

    refundLegs.push({ categoryId: refundedCategoryId, cents: -refundTx.refAmount.toCents(), time: refundTx.time });
  }

  return { base, refunds: refundLegs };
};
