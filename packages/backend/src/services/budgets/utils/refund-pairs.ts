import type { RecordId } from '@bt/shared/types';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import RefundTransactions from '@models/refund-transactions.model';
import TransactionSplits from '@models/transaction-splits.model';
import * as Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

interface RefundTxData {
  id: string;
  refAmount: Money;
  transactionType: TRANSACTION_TYPES;
  time: Date;
  categoryId: RecordId;
}

export interface RefundPair {
  originalTx: RefundTxData;
  refundTx: RefundTxData;
  /**
   * When the refund targets a specific split of the original transaction, this is the split's
   * category. Callers should prefer this over `originalTx.categoryId` for category aggregation
   * so refunds attach to the split that was actually refunded (matching the global
   * "Expenses Structure" widget). Null when the refund applies to the whole transaction.
   */
  splitCategoryId: RecordId | null;
  /** True when originalTx contributed to the budget aggregation */
  originalInBudget: boolean;
  /** True when refundTx contributed to the budget aggregation */
  refundInBudget: boolean;
}

/**
 * Fetches refund pairs for transactions counted in a budget aggregation.
 *
 * Why: budgets aggregate transactions by manual linkage or category match without filtering
 * refunds. A refund-income inflates the income total and the matching expense reflects gross
 * spend instead of net. To match the global "Expenses Structure" widget, we net out the refund
 * leg on whichever side(s) of the pair are in the budget.
 *
 * The returned pairs carry both transactions plus flags indicating which side(s) were counted,
 * so callers can decide where to apply `refundTx.refAmount` adjustments.
 */
export const fetchBudgetRefundPairs = async ({
  countedTransactions,
}: {
  countedTransactions: { id: string; refundLinked: boolean }[];
}): Promise<RefundPair[]> => {
  const budgetTxIds = new Set(countedTransactions.map((t) => t.id));
  const txIdsWithRefunds = countedTransactions.filter((t) => t.refundLinked).map((t) => t.id);

  if (txIdsWithRefunds.length === 0) return [];

  const refunds = await RefundTransactions.findAll({
    where: {
      [Op.or]: [{ refundTxId: { [Op.in]: txIdsWithRefunds } }, { originalTxId: { [Op.in]: txIdsWithRefunds } }],
    },
  });

  if (refunds.length === 0) return [];

  const allRefundTxIds = new Set<string>();
  const splitIdsToFetch = new Set<string>();
  for (const refund of refunds) {
    if (refund.originalTxId) allRefundTxIds.add(refund.originalTxId);
    allRefundTxIds.add(refund.refundTxId);
    if (refund.splitId) splitIdsToFetch.add(refund.splitId);
  }

  const [refundTxs, splits] = await Promise.all([
    Transactions.default.findAll({
      where: { id: { [Op.in]: [...allRefundTxIds] } },
      attributes: ['id', 'refAmount', 'transactionType', 'time', 'categoryId'],
    }),
    splitIdsToFetch.size > 0
      ? TransactionSplits.findAll({
          where: { id: { [Op.in]: [...splitIdsToFetch] } },
          attributes: ['id', 'categoryId'],
        })
      : Promise.resolve([] as TransactionSplits[]),
  ]);

  const txById = new Map<string, RefundTxData>(
    refundTxs.map((t) => [
      t.id,
      {
        id: t.id,
        refAmount: t.refAmount,
        transactionType: t.transactionType,
        time: t.time,
        categoryId: t.categoryId,
      },
    ]),
  );

  const splitCategoryById = new Map<string, RecordId>(splits.map((s) => [s.id, s.categoryId]));

  const pairs: RefundPair[] = [];
  for (const refund of refunds) {
    if (!refund.originalTxId) continue;
    const originalTx = txById.get(refund.originalTxId);
    const refundTx = txById.get(refund.refundTxId);
    if (!originalTx || !refundTx) continue;

    pairs.push({
      originalTx,
      refundTx,
      splitCategoryId: refund.splitId ? (splitCategoryById.get(refund.splitId) ?? null) : null,
      originalInBudget: budgetTxIds.has(originalTx.id),
      refundInBudget: budgetTxIds.has(refundTx.id),
    });
  }

  return pairs;
};
