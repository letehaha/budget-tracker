import { BUDGET_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Budgets from '@models/Budget.model';
import Categories from '@models/Categories.model';
import TransactionSplits from '@models/TransactionSplits.model';
import * as Transactions from '@models/Transactions.model';
import {
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  max,
  min,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { Op } from 'sequelize';

import { buildDateFilter } from './utils/build-date-filter';

interface CategoryInfo {
  id: number;
  name: string;
  color: string;
  parentId: number | null;
}

interface SpendingByCategoryItem {
  categoryId: number;
  name: string;
  color: string;
  amount: number; // cents, positive (expenses only)
  children?: SpendingByCategoryItem[];
}

interface CategoryAmountEntry {
  amount: number;
  children: Map<number, number>;
}

interface SpendingPeriod {
  periodStart: string; // yyyy-MM-dd
  periodEnd: string;
  expense: number; // cents, positive
  income: number; // cents, positive
}

interface SpendingStatsResponse {
  spendingsByCategory: SpendingByCategoryItem[];
  spendingOverTime: {
    granularity: 'monthly' | 'weekly';
    periods: SpendingPeriod[];
  };
}

type Granularity = 'monthly' | 'weekly';

const PERIOD_CONFIG = {
  monthly: {
    getStart: (date: Date) => startOfMonth(date),
    getEnd: (date: Date) => endOfMonth(date),
    advance: (date: Date) => addMonths(date, 1),
  },
  weekly: {
    getStart: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
    getEnd: (date: Date) => endOfWeek(date, { weekStartsOn: 1 }),
    advance: (date: Date) => addWeeks(date, 1),
  },
} as const;

const generatePeriodBuckets = ({
  from,
  to,
  granularity,
}: {
  from: Date;
  to: Date;
  granularity: Granularity;
}): { periodStart: Date; periodEnd: Date }[] => {
  const buckets: { periodStart: Date; periodEnd: Date }[] = [];
  const endDate = endOfDay(to);
  const { getStart, getEnd, advance } = PERIOD_CONFIG[granularity];

  let currentStart = getStart(from);
  while (isBefore(currentStart, endDate) || currentStart.getTime() === endDate.getTime()) {
    buckets.push({
      periodStart: max([currentStart, from]),
      periodEnd: min([getEnd(currentStart), endDate]),
    });
    currentStart = advance(currentStart);
  }

  return buckets;
};

const findBucketIndex = ({
  transactionTime,
  buckets,
}: {
  transactionTime: Date;
  buckets: { periodStart: Date; periodEnd: Date }[];
}): number => {
  const txTime = transactionTime.getTime();
  return buckets.findIndex((bucket) => txTime >= bucket.periodStart.getTime() && txTime <= bucket.periodEnd.getTime());
};

const getRootCategoryId = ({
  categoryId,
  categoryMap,
}: {
  categoryId: number;
  categoryMap: Map<number, CategoryInfo>;
}): number => {
  let current = categoryMap.get(categoryId);
  if (!current) return categoryId;

  while (current.parentId !== null) {
    const parent = categoryMap.get(current.parentId);
    if (!parent) break;
    current = parent;
  }

  return current.id;
};

/**
 * Walks up the category tree and returns the HIGHEST ancestor that is in
 * targetCategoryIds. Used for subcategory breakdown: when a budget contains
 * both a parent and its children, transactions under children aggregate to
 * the parent.
 */
const getTopLevelTargetCategoryId = ({
  categoryId,
  categoryMap,
  targetCategoryIds,
}: {
  categoryId: number;
  categoryMap: Map<number, CategoryInfo>;
  targetCategoryIds: Set<number>;
}): number => {
  let topLevel = categoryId;
  let current = categoryMap.get(categoryId);

  while (current) {
    if (targetCategoryIds.has(current.id)) {
      topLevel = current.id;
    }
    if (current.parentId === null) break;
    current = categoryMap.get(current.parentId);
  }

  return topLevel;
};

const determineGranularity = ({ from, to }: { from: Date; to: Date }): Granularity => {
  const diffMs = to.getTime() - from.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= 60 ? 'weekly' : 'monthly';
};

const getEmptyResponse = (): SpendingStatsResponse => ({
  spendingsByCategory: [],
  spendingOverTime: {
    granularity: 'monthly',
    periods: [],
  },
});

const buildCategoryMap = ({
  categories,
}: {
  categories: { id: number; name: string; color: string; parentId: number | null }[];
}): Map<number, CategoryInfo> => {
  const categoryMap = new Map<number, CategoryInfo>();
  categories.forEach((cat) => {
    categoryMap.set(cat.id, {
      id: cat.id,
      name: cat.name,
      color: cat.color,
      parentId: cat.parentId,
    });
  });
  return categoryMap;
};

const buildSpendingOverTime = ({
  buckets,
  granularity,
  periodData,
}: {
  buckets: { periodStart: Date; periodEnd: Date }[];
  granularity: Granularity;
  periodData: Map<number, { expense: number; income: number }>;
}): SpendingStatsResponse['spendingOverTime'] => ({
  granularity,
  periods: buckets.map((bucket, index) => {
    const data = periodData.get(index) || { expense: 0, income: 0 };
    return {
      periodStart: format(bucket.periodStart, 'yyyy-MM-dd'),
      periodEnd: format(bucket.periodEnd, 'yyyy-MM-dd'),
      expense: data.expense,
      income: data.income,
    };
  }),
});

const buildSpendingsByCategory = ({
  categoryAmounts,
  categoryMap,
}: {
  categoryAmounts: Map<number, CategoryAmountEntry>;
  categoryMap: Map<number, CategoryInfo>;
}): SpendingByCategoryItem[] => {
  const result: SpendingByCategoryItem[] = [];
  for (const [catId, entry] of categoryAmounts) {
    if (entry.amount === 0) continue;
    const catInfo = categoryMap.get(catId);

    const item: SpendingByCategoryItem = {
      categoryId: catId,
      name: catInfo?.name || 'Unknown',
      color: catInfo?.color || '#888888',
      amount: entry.amount,
    };

    if (entry.children.size > 0) {
      const children: SpendingByCategoryItem[] = [];
      for (const [childId, childAmount] of entry.children) {
        if (childAmount === 0) continue;
        const childInfo = categoryMap.get(childId);
        children.push({
          categoryId: childId,
          name: childInfo?.name || 'Unknown',
          color: childInfo?.color || '#888888',
          amount: childAmount,
        });
      }
      children.sort((a, b) => b.amount - a.amount);
      item.children = children;
    }

    result.push(item);
  }
  result.sort((a, b) => b.amount - a.amount);
  return result;
};

interface NormalizedTxData {
  time: Date;
  amount: number; // cents
  isExpense: boolean;
  categoryId: number | null; // aggregation target (root or top-level target), null = skip category aggregation
  originalCategoryId: number | null; // the actual leaf category
}

const determineDateRange = ({
  budgetStartDate,
  budgetEndDate,
  transactionTimes,
}: {
  budgetStartDate: Date | null;
  budgetEndDate: Date | null;
  transactionTimes: Date[];
}): { from: Date; to: Date } => {
  if (budgetStartDate && budgetEndDate) {
    return { from: new Date(budgetStartDate), to: new Date(budgetEndDate) };
  }
  const timestamps = transactionTimes.map((t) => t.getTime());
  return {
    from: new Date(Math.min(...timestamps)),
    to: new Date(Math.max(...timestamps)),
  };
};

const aggregateTransactionData = ({
  txDataList,
  budgetStartDate,
  budgetEndDate,
  categoryMap,
}: {
  txDataList: NormalizedTxData[];
  budgetStartDate: Date | null;
  budgetEndDate: Date | null;
  categoryMap: Map<number, CategoryInfo>;
}): SpendingStatsResponse => {
  const { from: rangeFrom, to: rangeTo } = determineDateRange({
    budgetStartDate,
    budgetEndDate,
    transactionTimes: txDataList.map((d) => new Date(d.time)),
  });

  const granularity = determineGranularity({ from: rangeFrom, to: rangeTo });
  const buckets = generatePeriodBuckets({ from: rangeFrom, to: rangeTo, granularity });

  const periodData = new Map<number, { expense: number; income: number }>();
  buckets.forEach((_, index) => periodData.set(index, { expense: 0, income: 0 }));

  const categoryAmounts = new Map<number, CategoryAmountEntry>();

  for (const txData of txDataList) {
    const bucketIndex = findBucketIndex({ transactionTime: new Date(txData.time), buckets });
    if (bucketIndex !== -1) {
      const period = periodData.get(bucketIndex)!;
      if (txData.isExpense) {
        period.expense += txData.amount;
      } else {
        period.income += txData.amount;
      }
    }

    if (txData.isExpense && txData.categoryId !== null) {
      const entry = categoryAmounts.get(txData.categoryId) ?? { amount: 0, children: new Map() };
      entry.amount += txData.amount;
      if (txData.originalCategoryId !== null && txData.originalCategoryId !== txData.categoryId) {
        entry.children.set(
          txData.originalCategoryId,
          (entry.children.get(txData.originalCategoryId) ?? 0) + txData.amount,
        );
      }
      categoryAmounts.set(txData.categoryId, entry);
    }
  }

  return {
    spendingsByCategory: buildSpendingsByCategory({ categoryAmounts, categoryMap }),
    spendingOverTime: buildSpendingOverTime({ buckets, granularity, periodData }),
  };
};

/**
 * Manual budget: fetch transactions via budgetIds, group by root category
 */
const getManualBudgetSpendingStats = async ({
  userId,
  budgetId,
}: {
  userId: number;
  budgetId: number;
}): Promise<SpendingStatsResponse> => {
  const budgetDetails = await Budgets.findOne({ where: { id: budgetId, userId } });
  if (!budgetDetails) throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });

  const transactions = await Transactions.findWithFilters({
    userId,
    excludeTransfer: true,
    budgetIds: [budgetId],
    from: 0,
    limit: Infinity,
    attributes: ['time', 'refAmount', 'transactionType', 'categoryId'],
  });

  if (transactions.length === 0) return getEmptyResponse();

  const allCategories = await Categories.findAll({
    where: { userId },
    attributes: ['id', 'name', 'color', 'parentId'],
    raw: true,
  });
  const categoryMap = buildCategoryMap({ categories: allCategories });

  const txDataList: NormalizedTxData[] = transactions.map((tx) => {
    const rootCatId = tx.categoryId ? getRootCategoryId({ categoryId: tx.categoryId, categoryMap }) : null;
    return {
      time: tx.time,
      amount: tx.refAmount.toCents(),
      isExpense: tx.transactionType === TRANSACTION_TYPES.expense,
      categoryId: rootCatId,
      originalCategoryId: tx.categoryId,
    };
  });

  return aggregateTransactionData({
    txDataList,
    budgetStartDate: budgetDetails.startDate,
    budgetEndDate: budgetDetails.endDate,
    categoryMap,
  });
};

/**
 * Category budget: fetch transactions by category IDs, handle splits
 */
const getCategoryBudgetSpendingStats = async ({
  userId,
  budgetId,
}: {
  userId: number;
  budgetId: number;
}): Promise<SpendingStatsResponse> => {
  const budgetDetails = await Budgets.findOne({
    where: { id: budgetId, userId },
    include: [{ model: Categories, as: 'categories', attributes: ['id'] }],
  });

  if (!budgetDetails) throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });

  const budgetCategoryIds = budgetDetails.categories?.map((c) => c.id) || [];

  if (!budgetCategoryIds.length) return getEmptyResponse();

  const dateFilter = buildDateFilter({
    startDate: budgetDetails.startDate,
    endDate: budgetDetails.endDate,
  });

  // Fetch all user categories for hierarchy
  const allCategories = await Categories.findAll({
    where: { userId },
    attributes: ['id', 'name', 'color', 'parentId'],
    raw: true,
  });
  const categoryMap = buildCategoryMap({ categories: allCategories });
  const targetCategoryIds = new Set(budgetCategoryIds);

  // Expand target categories to include all descendants
  const expandedCategoryIds = new Set<number>(budgetCategoryIds);
  allCategories.forEach((cat) => {
    let current: CategoryInfo | undefined = categoryMap.get(cat.id);
    while (current) {
      if (targetCategoryIds.has(current.id)) {
        expandedCategoryIds.add(cat.id);
        break;
      }
      if (current.parentId === null) break;
      current = categoryMap.get(current.parentId);
    }
  });

  // Primary category transactions (without splits)
  const primaryCategoryTransactions = await Transactions.default.findAll({
    where: {
      userId,
      categoryId: { [Op.in]: Array.from(expandedCategoryIds) },
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      ...dateFilter,
    },
    include: [{ model: TransactionSplits, as: 'splits', required: false }],
    raw: false,
  });

  // Matching splits
  const matchingSplits = await TransactionSplits.findAll({
    where: {
      userId,
      categoryId: { [Op.in]: Array.from(expandedCategoryIds) },
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

  const txDataList: NormalizedTxData[] = [];

  // Process primary category transactions (only those WITHOUT splits)
  for (const tx of primaryCategoryTransactions) {
    const splits = tx.get('splits') as TransactionSplits[] | undefined;
    if (splits && splits.length > 0) continue;

    const topLevelCatId = getTopLevelTargetCategoryId({
      categoryId: tx.categoryId!,
      categoryMap,
      targetCategoryIds,
    });

    txDataList.push({
      time: tx.time,
      amount: tx.refAmount.toCents(),
      isExpense: tx.transactionType === TRANSACTION_TYPES.expense,
      categoryId: topLevelCatId,
      originalCategoryId: tx.categoryId!,
    });
  }

  // Process splits
  for (const split of matchingSplits) {
    const transaction = split.get('transaction') as Transactions.default;
    if (!transaction) continue;

    const topLevelCatId = getTopLevelTargetCategoryId({
      categoryId: split.categoryId,
      categoryMap,
      targetCategoryIds,
    });

    txDataList.push({
      time: transaction.time,
      amount: split.refAmount.toCents(),
      isExpense: transaction.transactionType === TRANSACTION_TYPES.expense,
      categoryId: topLevelCatId,
      originalCategoryId: split.categoryId,
    });
  }

  if (txDataList.length === 0) return getEmptyResponse();

  return aggregateTransactionData({
    txDataList,
    budgetStartDate: budgetDetails.startDate,
    budgetEndDate: budgetDetails.endDate,
    categoryMap,
  });
};

export const getBudgetSpendingStats = async ({
  userId,
  budgetId,
}: {
  userId: number;
  budgetId: number;
}): Promise<SpendingStatsResponse> => {
  const budgetDetails = await Budgets.findOne({ where: { id: budgetId, userId }, attributes: ['type'] });

  if (!budgetDetails) throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });

  if (budgetDetails.type === BUDGET_TYPES.category) {
    return getCategoryBudgetSpendingStats({ userId, budgetId });
  }

  return getManualBudgetSpendingStats({ userId, budgetId });
};
