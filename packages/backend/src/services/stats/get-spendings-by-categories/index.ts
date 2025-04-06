import { TRANSACTION_TYPES } from '@bt/shared/types';
import { endpointsTypes } from '@bt/shared/types';
import { UnwrapPromise } from '@common/types';
import * as Categories from '@models/Categories.model';
import RefundTransactions from '@models/RefundTransactions.model';
import Transactions from '@models/Transactions.model';
import { withTransaction } from '@root/services/common/with-transaction';
import { Op } from 'sequelize';

import { getExpensesHistory } from '../get-expenses-history';

export const getSpendingsByCategories = withTransaction(
  async (params: { userId: number; accountId?: number; from?: string; to?: string }) => {
    const transactions = await getExpensesHistory(params);
    const txIds = transactions.filter((i) => i.refundLinked).map((i) => i.id);
    const refunds = await RefundTransactions.findAll({
      where: {
        [Op.or]: [{ refundTxId: { [Op.in]: txIds } }, { originalTxId: { [Op.in]: txIds } }],
      },
      raw: true,
    });

    const categories = await Categories.default.findAll({
      where: { userId: params.userId },
      attributes: ['id', 'parentId', 'name', 'color'],
      raw: true,
    });

    const groupedByCategories = await groupAndAdjustData({
      categories,
      transactions,
      refunds,
    });

    return groupedByCategories;
  },
);

type TransactionsParam = UnwrapPromise<ReturnType<typeof getExpensesHistory>>;
/**
 * Groups transactions refAmounts per category, and adjusts them based on existing refunds
 */
const groupAndAdjustData = async (params: {
  categories: Categories.default[];
  transactions: TransactionsParam;
  refunds: RefundTransactions[];
}) => {
  const { categories, transactions, refunds } = params;
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

  transactions.forEach((transaction) => {
    const rootCategoryId = getRootCategoryId(transaction.categoryId).toString();
    const rootCategory = categoryMap.get(Number(rootCategoryId));

    if (rootCategoryId in result) {
      result[rootCategoryId].amount += transaction.refAmount;
    } else {
      result[rootCategoryId] = {
        amount: transaction.refAmount,
        name: rootCategory ? rootCategory.name : 'Unknown',
        color: rootCategory ? rootCategory.color : '#000000',
      };
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

    // We always need to adjust spendings exactly for expense transactions
    const wantedCategoryId =
      pair.base.transactionType === TRANSACTION_TYPES.expense ? pair.base.categoryId : pair.refund.categoryId;
    const rootCategoryId = getRootCategoryId(wantedCategoryId).toString();

    if (rootCategoryId in result) {
      result[rootCategoryId].amount -= pair.refund.refAmount;
    }
  }

  // TODO: store result to Redis, make the key be based on the from-to-accountId

  return result;
};
