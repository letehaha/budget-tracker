import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, endpointsTypes } from '@bt/shared/types';
import { rawCents } from '@common/types/money';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/Accounts.model';
import Categories from '@models/Categories.model';
import * as Transactions from '@models/Transactions.model';
import {
  addDays,
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

import { getUserSettings } from '../user-settings/get-user-settings';
import { getWhereConditionForTime } from './utils';

interface GetCashFlowParams {
  userId: number;
  from: string;
  to: string;
  granularity: endpointsTypes.CashFlowGranularity;
  accountId?: number;
  categoryIds?: number[];
  excludeCategories?: boolean;
}

/**
 * Generates period buckets based on granularity
 */
const generatePeriodBuckets = ({
  from,
  to,
  granularity,
}: {
  from: string;
  to: string;
  granularity: endpointsTypes.CashFlowGranularity;
}): { periodStart: Date; periodEnd: Date }[] => {
  const buckets: { periodStart: Date; periodEnd: Date }[] = [];
  const startDate = new Date(from);
  // Use endOfDay to include all transactions on the last day of the period
  const endDate = endOfDay(new Date(to));

  let currentStart: Date;
  let currentEnd: Date;

  switch (granularity) {
    case 'monthly': {
      currentStart = startOfMonth(startDate);
      while (isBefore(currentStart, endDate) || currentStart.getTime() === endDate.getTime()) {
        currentEnd = endOfMonth(currentStart);
        buckets.push({
          periodStart: max([currentStart, startDate]),
          periodEnd: min([currentEnd, endDate]),
        });
        currentStart = addMonths(currentStart, 1);
      }
      break;
    }
    case 'biweekly': {
      // Start from the beginning of the week containing `from`
      currentStart = startOfWeek(startDate, { weekStartsOn: 1 });
      while (isBefore(currentStart, endDate) || currentStart.getTime() === endDate.getTime()) {
        // Bi-weekly: 2 weeks at a time. Use endOfDay to include all transactions on the last day.
        currentEnd = endOfDay(addDays(addWeeks(currentStart, 2), -1));
        buckets.push({
          periodStart: max([currentStart, startDate]),
          periodEnd: min([currentEnd, endDate]),
        });
        currentStart = addWeeks(currentStart, 2);
      }
      break;
    }
    case 'weekly': {
      currentStart = startOfWeek(startDate, { weekStartsOn: 1 });
      while (isBefore(currentStart, endDate) || currentStart.getTime() === endDate.getTime()) {
        currentEnd = endOfWeek(currentStart, { weekStartsOn: 1 });
        buckets.push({
          periodStart: max([currentStart, startDate]),
          periodEnd: min([currentEnd, endDate]),
        });
        currentStart = addWeeks(currentStart, 1);
      }
      break;
    }
  }

  return buckets;
};

/**
 * Determines which bucket a transaction belongs to based on its time
 */
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

interface CategoryInfo {
  id: number;
  name: string;
  color: string;
  parentId: number | null;
}

interface CategoryAmounts {
  incomeAmount: number;
  expenseAmount: number;
}

interface PeriodCategoryData {
  income: number;
  expenses: number;
  categories: Map<number, CategoryAmounts>; // categoryId -> amounts by type (aggregated by target category)
}

/**
 * Get the root category ID for a given category
 */
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
 * Get the aggregation category ID for a transaction's category.
 * If targetCategoryIds is provided, finds the closest ancestor (or self) that's in the target set.
 * Otherwise, returns the root category ID.
 */
const getAggregationCategoryId = ({
  categoryId,
  categoryMap,
  targetCategoryIds,
}: {
  categoryId: number;
  categoryMap: Map<number, CategoryInfo>;
  targetCategoryIds?: Set<number>;
}): number => {
  // If no target categories specified, aggregate to root
  if (!targetCategoryIds) {
    return getRootCategoryId({ categoryId, categoryMap });
  }

  // If this category is itself a target, use it
  if (targetCategoryIds.has(categoryId)) {
    return categoryId;
  }

  // Walk up the hierarchy to find an ancestor that's a target
  let current = categoryMap.get(categoryId);
  while (current) {
    if (targetCategoryIds.has(current.id)) {
      return current.id;
    }
    if (current.parentId === null) break;
    current = categoryMap.get(current.parentId);
  }

  // Fallback: if no target ancestor found, use the category itself
  // (this shouldn't happen if filtering is correct, but handles edge cases)
  return categoryId;
};

/**
 * Fetches cash flow data (income vs expenses) for a specified user within a date range,
 * aggregated by the specified granularity.
 */
export const getCashFlow = async ({
  userId,
  from,
  to,
  granularity,
  accountId,
  categoryIds,
  excludeCategories = false,
}: GetCashFlowParams): Promise<endpointsTypes.GetCashFlowResponse> => {
  // Generate period buckets
  const buckets = generatePeriodBuckets({ from, to, granularity });

  // Initialize period data
  const periodDataMap: Map<number, PeriodCategoryData> = new Map();
  buckets.forEach((_, index) => {
    periodDataMap.set(index, { income: 0, expenses: 0, categories: new Map() });
  });

  // Get excluded categories if needed
  let excludedCategoryIds: number[] = [];
  if (excludeCategories) {
    const settings = await getUserSettings({ userId });
    excludedCategoryIds = settings.stats.expenses.excludedCategories;
  }

  // Fetch ALL user categories to build the hierarchy map
  const allCategories = await Categories.findAll({
    where: { userId },
    attributes: ['id', 'name', 'color', 'parentId'],
    raw: true,
  });

  // Build category lookup map
  const categoryMap: Map<number, CategoryInfo> = new Map();
  allCategories.forEach((cat) => {
    categoryMap.set(cat.id, {
      id: cat.id,
      name: cat.name,
      color: cat.color,
      parentId: cat.parentId,
    });
  });

  // Get root categories (those without a parent)
  const rootCategories = allCategories.filter((cat) => cat.parentId === null);

  // Determine which category IDs to filter by in the query
  let queryFilterCategoryIds: number[] | undefined;

  if (categoryIds && categoryIds.length > 0) {
    // User selected specific categories - expand to include all children
    const expandedCategoryIds = new Set<number>(categoryIds);

    // For each selected category, add all its descendants
    allCategories.forEach((cat) => {
      // Check if this category's root or any ancestor is in the selected list
      let current: CategoryInfo | undefined = categoryMap.get(cat.id);
      while (current) {
        if (categoryIds.includes(current.id)) {
          expandedCategoryIds.add(cat.id);
          break;
        }
        if (current.parentId === null) break;
        current = categoryMap.get(current.parentId);
      }
    });

    queryFilterCategoryIds = Array.from(expandedCategoryIds);
  }

  // Build where clause for categories
  const categoryWhere =
    queryFilterCategoryIds && queryFilterCategoryIds.length > 0
      ? { [Op.in]: queryFilterCategoryIds }
      : excludeCategories && excludedCategoryIds.length > 0
        ? { [Op.notIn]: excludedCategoryIds }
        : undefined;

  // Fetch all transactions (both income and expense) in the date range
  const transactions = await Transactions.default.findAll({
    where: removeUndefinedKeys({
      accountId,
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      transactionType: {
        [Op.in]: [TRANSACTION_TYPES.income, TRANSACTION_TYPES.expense],
      },
      ...(categoryWhere ? { categoryId: categoryWhere } : {}),
      ...getWhereConditionForTime({ from, to, columnName: 'time' }),
    }),
    include: [
      {
        model: Accounts,
        where: { isEnabled: true },
        attributes: [],
      },
    ],
    raw: true,
    attributes: ['time', 'refAmount', 'transactionType', 'categoryId'],
  });

  // Determine which categories to report in the breakdown
  // If specific categories selected, report those exact categories (not aggregated to root)
  // Otherwise, aggregate to root categories
  let reportCategoryIds: number[];
  // When specific categories are selected, aggregate to those categories instead of root
  const aggregateToSelectedCategories = categoryIds && categoryIds.length > 0;

  if (aggregateToSelectedCategories) {
    // Report the exact categories the user selected
    reportCategoryIds = categoryIds;
  } else {
    // Use all root categories
    reportCategoryIds = rootCategories.map((cat) => cat.id);
  }

  // Create a set of target categories for aggregation (when specific categories are selected)
  const targetCategoryIds = aggregateToSelectedCategories ? new Set(categoryIds) : undefined;

  // Aggregate transactions into buckets
  for (const tx of transactions) {
    const txTime = new Date(tx.time);
    const bucketIndex = findBucketIndex({ transactionTime: txTime, buckets });

    if (bucketIndex === -1) continue;

    const periodData = periodDataMap.get(bucketIndex)!;
    const amount = rawCents(tx.refAmount);

    if (tx.transactionType === TRANSACTION_TYPES.income) {
      periodData.income += amount;
    } else if (tx.transactionType === TRANSACTION_TYPES.expense) {
      periodData.expenses += amount;
    }

    // Track per-category amounts by type
    // When specific categories selected: aggregate to those categories
    // Otherwise: aggregate to root categories
    if (tx.categoryId) {
      const aggregationCategoryId = getAggregationCategoryId({
        categoryId: tx.categoryId,
        categoryMap,
        targetCategoryIds,
      });
      const currentAmounts = periodData.categories.get(aggregationCategoryId) || {
        incomeAmount: 0,
        expenseAmount: 0,
      };

      if (tx.transactionType === TRANSACTION_TYPES.income) {
        currentAmounts.incomeAmount += amount;
      } else if (tx.transactionType === TRANSACTION_TYPES.expense) {
        currentAmounts.expenseAmount += amount;
      }

      periodData.categories.set(aggregationCategoryId, currentAmounts);
    }
  }

  // Build response periods
  const periods: endpointsTypes.CashFlowPeriodData[] = buckets.map((bucket, index) => {
    const data = periodDataMap.get(index)!;

    const period: endpointsTypes.CashFlowPeriodData = {
      periodStart: format(bucket.periodStart, 'yyyy-MM-dd'),
      periodEnd: format(bucket.periodEnd, 'yyyy-MM-dd'),
      income: data.income,
      expenses: data.expenses,
      netFlow: data.income - data.expenses,
    };

    // Always add category breakdown (for stacked bars)
    // Filter to only include categories that have data in at least one period
    const categoriesWithData = reportCategoryIds.filter((catId) => {
      // Check if this category has any data across all periods
      for (const [, periodData] of periodDataMap) {
        const amounts = periodData.categories.get(catId);
        if (amounts && (amounts.incomeAmount !== 0 || amounts.expenseAmount !== 0)) {
          return true;
        }
      }
      return false;
    });

    period.categories = categoriesWithData.map((catId) => {
      const catInfo = categoryMap.get(catId) || { name: 'Unknown', color: '#888888' };
      const amounts = data.categories.get(catId) || { incomeAmount: 0, expenseAmount: 0 };
      return {
        categoryId: catId,
        name: catInfo.name,
        color: catInfo.color,
        incomeAmount: amounts.incomeAmount,
        expenseAmount: amounts.expenseAmount,
      };
    });

    return period;
  });

  // Calculate totals
  const totals = periods.reduce(
    (acc, period) => {
      acc.income += period.income;
      acc.expenses += period.expenses;
      acc.netFlow += period.netFlow;
      return acc;
    },
    { income: 0, expenses: 0, netFlow: 0, savingsRate: 0 },
  );

  // Calculate savings rate (percentage of income saved)
  // If no income, savings rate is 0 (or could be negative infinity, but we'll use 0)
  totals.savingsRate = totals.income > 0 ? Math.round((totals.netFlow / totals.income) * 100) : 0;

  return { periods, totals };
};
