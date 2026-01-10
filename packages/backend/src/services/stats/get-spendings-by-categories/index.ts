import { TRANSACTION_TYPES } from '@bt/shared/types';
import { endpointsTypes } from '@bt/shared/types';
import { UnwrapPromise } from '@common/types';
import * as Categories from '@models/Categories.model';
import RefundTransactions from '@models/RefundTransactions.model';
import TransactionSplits from '@models/TransactionSplits.model';
import Transactions from '@models/Transactions.model';
import { withTransaction } from '@root/services/common/with-transaction';
import { Op } from 'sequelize';

import { getExpensesHistory } from '../get-expenses-history';

export const getSpendingsByCategories = withTransaction(
  async (params: {
    userId: number;
    accountId?: number;
    from?: string;
    to?: string;
    transactionType?: TRANSACTION_TYPES;
  }) => {
    const transactions = await getExpensesHistory(params);
    const txIds = transactions.map((i) => i.id);
    const txIdsWithRefunds = transactions.filter((i) => i.refundLinked).map((i) => i.id);

    // Fetch refunds for transactions with refund links
    const refunds = await RefundTransactions.findAll({
      where: {
        [Op.or]: [{ refundTxId: { [Op.in]: txIdsWithRefunds } }, { originalTxId: { [Op.in]: txIdsWithRefunds } }],
      },
      raw: true,
    });

    // Fetch splits for all transactions in the period
    const splits = await TransactionSplits.findAll({
      where: {
        transactionId: { [Op.in]: txIds },
        userId: params.userId,
      },
      raw: true,
    });

    // Group splits by transactionId for easy lookup
    const splitsByTxId = new Map<number, TransactionSplits[]>();
    for (const split of splits) {
      const existing = splitsByTxId.get(split.transactionId) || [];
      existing.push(split);
      splitsByTxId.set(split.transactionId, existing);
    }

    const categories = await Categories.default.findAll({
      where: { userId: params.userId },
      attributes: ['id', 'parentId', 'name', 'color'],
      raw: true,
    });

    const groupedByCategories = await groupAndAdjustData({
      categories,
      transactions,
      refunds,
      splitsByTxId,
    });

    return groupedByCategories;
  },
);

type TransactionsParam = UnwrapPromise<ReturnType<typeof getExpensesHistory>>;
/**
 * Groups transactions refAmounts per category, and adjusts them based on existing refunds and splits.
 * For split transactions:
 * - Primary category gets: transaction.refAmount - sum of splits
 * - Each split category gets: split.refAmount
 */
const groupAndAdjustData = async (params: {
  categories: Categories.default[];
  transactions: TransactionsParam;
  refunds: RefundTransactions[];
  splitsByTxId: Map<number, TransactionSplits[]>;
}) => {
  const { categories, transactions, refunds, splitsByTxId } = params;
  const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));
  const result: endpointsTypes.GetSpendingsByCategoriesReturnType = {};

  // Function to get root category ID
  const getRootCategoryId = (categoryId: number): number => {
    let currentCategory = categoryMap.get(categoryId);
    while (currentCategory && currentCategory.parentId !== null) {
      currentCategory = categoryMap.get(currentCategory.parentId);
    }
    return currentCategory ? currentCategory.id : categoryId;
  };

  // Helper to add amount to a category
  const addToCategory = (categoryId: number, amount: number) => {
    const rootCategoryId = getRootCategoryId(categoryId).toString();
    const rootCategory = categoryMap.get(Number(rootCategoryId));

    if (rootCategoryId in result) {
      result[rootCategoryId].amount += amount;
    } else {
      result[rootCategoryId] = {
        amount,
        name: rootCategory ? rootCategory.name : 'Unknown',
        color: rootCategory ? rootCategory.color : '#000000',
      };
    }
  };

  transactions.forEach((transaction) => {
    const txSplits = splitsByTxId.get(transaction.id);

    if (txSplits && txSplits.length > 0) {
      // Transaction has splits - distribute amounts accordingly
      const splitsRefTotal = txSplits.reduce((sum, split) => sum + Number(split.refAmount), 0);
      const primaryAmount = transaction.refAmount - splitsRefTotal;

      // Add primary category amount (if > 0)
      if (primaryAmount > 0) {
        addToCategory(transaction.categoryId, primaryAmount);
      }

      // Add each split to its category
      for (const split of txSplits) {
        addToCategory(split.categoryId, Number(split.refAmount));
      }
    } else {
      // No splits - use the full amount for primary category (original behavior)
      addToCategory(transaction.categoryId, transaction.refAmount);
    }
  });

  // Adjust amounts based on refunds. Uses exactly refAmount, not amount, because stats are always
  // describe ref currency
  for (const refund of refunds) {
    const pair = {
      base: transactions.find((t) => t.id === refund.originalTxId),
      refund: transactions.find((t) => t.id === refund.refundTxId),
    };
    const findByPkParams = {
      raw: true,
      attributes: ['refAmount', 'categoryId', 'transactionType'],
    };

    // In case not found refund transactions in current time period, fetch them separately regardless
    // of time period.
    if (!pair.base) pair.base = (await Transactions.findByPk(refund.originalTxId, findByPkParams))!;
    if (!pair.refund) {
      pair.refund = (await Transactions.findByPk(refund.refundTxId, findByPkParams))!;
    }

    // Determine which category to adjust based on refund target
    let wantedCategoryId: number;

    if (refund.splitId) {
      // Refund targets a specific split - use that split's category
      let targetSplit = splitsByTxId.get(refund.originalTxId!)?.find((s) => s.id === refund.splitId);

      // If split not found in cache (original tx might be outside date range), fetch it directly
      if (!targetSplit && refund.originalTxId) {
        targetSplit =
          (await TransactionSplits.findOne({
            where: { id: refund.splitId },
            raw: true,
          })) ?? undefined;
      }

      wantedCategoryId = targetSplit ? targetSplit.categoryId : pair.base.categoryId;
    } else {
      // Refund applies to whole transaction - use expense transaction's category
      wantedCategoryId =
        pair.base.transactionType === TRANSACTION_TYPES.expense ? pair.base.categoryId : pair.refund.categoryId;
    }

    const rootCategoryId = getRootCategoryId(wantedCategoryId).toString();

    if (rootCategoryId in result) {
      result[rootCategoryId].amount -= pair.refund.refAmount;
    }
  }

  // TODO: store result to Redis, make the key be based on the from-to-accountId

  return result;
};
