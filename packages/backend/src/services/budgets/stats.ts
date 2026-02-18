import { BUDGET_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { rawCents } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Budgets from '@models/Budget.model';
import Categories from '@models/Categories.model';
import TransactionSplits from '@models/TransactionSplits.model';
import * as Transactions from '@models/Transactions.model';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';
import { buildDateFilter } from './utils/build-date-filter';

interface StatsResponse {
  summary: {
    actualIncome: number;
    actualExpense: number;
    balance: number; // Net difference
    utilizationRate: null | number; // Percentage used (0-100)
    transactionsCount: number;
    firstTransactionDate: string | null; // ISO date string of earliest transaction
    lastTransactionDate: string | null; // ISO date string of latest transaction
  };
}

export const getResponseInitialState = (): StatsResponse => ({
  summary: {
    actualIncome: 0,
    actualExpense: 0,
    balance: 0, // Net difference
    utilizationRate: null, // Percentage used (0-100)
    transactionsCount: 0,
    firstTransactionDate: null,
    lastTransactionDate: null,
  },
});

/**
 * Calculate stats for manual budgets using BudgetTransactions junction table.
 */
const getManualBudgetStats = async ({
  userId,
  budgetId,
}: {
  userId: number;
  budgetId: number;
}): Promise<StatsResponse> => {
  const budgetDetails = await Budgets.findByPk(budgetId);
  if (!budgetDetails) throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });

  const transactions: Pick<Transactions.default, 'time' | 'amount' | 'refAmount' | 'transactionType'>[] =
    await Transactions.findWithFilters({
      userId,
      excludeTransfer: true,
      budgetIds: [budgetId],
      from: 0,
      limit: Infinity,
      isRaw: true,
      attributes: ['time', 'amount', 'refAmount', 'transactionType'],
    });

  return aggregateTransactionStats({ transactions, limitAmount: budgetDetails.limitAmount?.toCents() ?? null });
};

/**
 * Calculate stats for category-based budgets.
 * Handles split transactions correctly by only counting the split amount for matching categories.
 */
const getCategoryBudgetStats = async ({
  userId,
  budgetId,
}: {
  userId: number;
  budgetId: number;
}): Promise<StatsResponse> => {
  const budgetDetails = await Budgets.findByPk(budgetId, {
    include: [{ model: Categories, as: 'categories', attributes: ['id'] }],
  });

  if (!budgetDetails) throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });

  const categoryIds = budgetDetails.categories?.map((c) => c.id) || [];

  if (!categoryIds.length) {
    return getResponseInitialState();
  }

  const dateFilter = buildDateFilter({
    startDate: budgetDetails.startDate,
    endDate: budgetDetails.endDate,
  });

  // Get transactions where primary category matches and have no splits
  const primaryCategoryTransactions = await Transactions.default.findAll({
    where: {
      userId,
      categoryId: { [Op.in]: categoryIds },
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      ...dateFilter,
    },
    include: [{ model: TransactionSplits, as: 'splits', required: false }],
    raw: false,
  });

  // Get splits that match the categories
  const matchingSplits = await TransactionSplits.findAll({
    where: {
      userId,
      categoryId: { [Op.in]: categoryIds },
    },
    include: [
      {
        model: Transactions.default,
        as: 'transaction',
        where: {
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          ...dateFilter,
        },
        attributes: ['id', 'time', 'transactionType'],
      },
    ],
  });

  const result = getResponseInitialState();
  const countedTransactionIds = new Set<number>();

  // Process primary category transactions (only those WITHOUT splits)
  for (const tx of primaryCategoryTransactions) {
    const splits = tx.get('splits') as TransactionSplits[] | undefined;

    // If transaction has splits, skip it here - we'll count the split amounts separately
    if (splits && splits.length > 0) {
      continue;
    }

    countedTransactionIds.add(tx.id);
    const isExpense = tx.transactionType === TRANSACTION_TYPES.expense;

    if (isExpense) {
      result.summary.actualExpense += tx.refAmount.toCents();
      result.summary.balance -= tx.refAmount.toCents();
    } else {
      result.summary.actualIncome += tx.refAmount.toCents();
      result.summary.balance += tx.refAmount.toCents();
    }

    updateDateRange(result, tx.time);
  }

  // Process splits - only count the split's refAmount
  for (const split of matchingSplits) {
    const transaction = split.get('transaction') as Transactions.default;
    if (!transaction) continue;

    countedTransactionIds.add(transaction.id);
    const isExpense = transaction.transactionType === TRANSACTION_TYPES.expense;

    if (isExpense) {
      result.summary.actualExpense += split.refAmount.toCents();
      result.summary.balance -= split.refAmount.toCents();
    } else {
      result.summary.actualIncome += split.refAmount.toCents();
      result.summary.balance += split.refAmount.toCents();
    }

    updateDateRange(result, transaction.time);
  }

  result.summary.transactionsCount = countedTransactionIds.size;

  if (budgetDetails.limitAmount) {
    const netSpending = Math.max(0, -result.summary.balance);
    result.summary.utilizationRate = (netSpending / budgetDetails.limitAmount.toCents()) * 100;
  }

  return result;
};

/**
 * Helper to update date range in stats
 */
const updateDateRange = (result: StatsResponse, time: Date) => {
  const txDate = new Date(time).toISOString();
  if (!result.summary.firstTransactionDate || txDate < result.summary.firstTransactionDate) {
    result.summary.firstTransactionDate = txDate;
  }
  if (!result.summary.lastTransactionDate || txDate > result.summary.lastTransactionDate) {
    result.summary.lastTransactionDate = txDate;
  }
};

/**
 * Helper to aggregate transaction stats
 */
const aggregateTransactionStats = ({
  transactions,
  limitAmount,
}: {
  transactions: Pick<Transactions.default, 'time' | 'refAmount' | 'transactionType'>[];
  limitAmount: number | null;
}): StatsResponse => {
  const result = transactions.reduce((acc, curr) => {
    const isExpense = curr.transactionType === TRANSACTION_TYPES.expense;
    const refAmount = rawCents(curr.refAmount);

    if (isExpense) {
      acc.summary.actualExpense += refAmount;
      acc.summary.balance -= refAmount;
    } else {
      acc.summary.actualIncome += refAmount;
      acc.summary.balance += refAmount;
    }

    updateDateRange(acc, curr.time);
    return acc;
  }, getResponseInitialState());

  result.summary.transactionsCount = transactions.length;

  if (limitAmount) {
    const netSpending = Math.max(0, -result.summary.balance);
    result.summary.utilizationRate = (netSpending / limitAmount) * 100;
  }

  return result;
};

export const getBudgetStats = withTransaction(
  async ({ userId, budgetId }: { userId: number; budgetId: number }): Promise<StatsResponse> => {
    const budgetDetails = await Budgets.findByPk(budgetId, { attributes: ['type'] });

    if (!budgetDetails) throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });

    if (budgetDetails.type === BUDGET_TYPES.category) {
      return getCategoryBudgetStats({ userId, budgetId });
    }

    return getManualBudgetStats({ userId, budgetId });
  },
);
