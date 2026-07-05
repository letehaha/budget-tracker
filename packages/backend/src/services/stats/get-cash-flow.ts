import type { RecordId } from '@bt/shared/types';
import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, endpointsTypes } from '@bt/shared/types';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/accounts.model';
import * as Transactions from '@models/transactions.model';
import { expandCategoryIdsWithDescendants, getRootCategoryId } from '@services/categories/category-hierarchy';
import {
  AccessibleCategoryInfo,
  getAccessibleCategoryMap,
} from '@services/categories/get-accessible-category-map.service';
import { format } from 'date-fns';
import { Op } from 'sequelize';

import { findBucketIndex, generatePeriodBuckets, getWhereConditionForTime } from './utils';

interface GetCashFlowParams {
  userId: number;
  from: string;
  to: string;
  granularity: endpointsTypes.CashFlowGranularity;
  accountId?: string;
  categoryIds?: RecordId[];
}

type CategoryInfo = AccessibleCategoryInfo;

interface CategoryAmounts {
  incomeAmount: number;
  expenseAmount: number;
}

interface PeriodCategoryData {
  income: number;
  expenses: number;
  categories: Map<string, CategoryAmounts>; // categoryId -> amounts by type (aggregated by target category)
}

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
  categoryId: string;
  categoryMap: Map<string, CategoryInfo>;
  targetCategoryIds?: Set<string>;
}): string => {
  // If no target categories specified, aggregate to root
  if (!targetCategoryIds) {
    return getRootCategoryId({ categoryId, byId: categoryMap });
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
}: GetCashFlowParams): Promise<endpointsTypes.GetCashFlowResponse> => {
  // Generate period buckets
  const buckets = generatePeriodBuckets({ from, to, granularity });

  // Initialize period data
  const periodDataMap: Map<number, PeriodCategoryData> = new Map();
  buckets.forEach((_, index) => {
    periodDataMap.set(index, { income: 0, expenses: 0, categories: new Map() });
  });

  // Fetch categories for every owner whose accounts the caller can see (own + shared) so
  // shared-account transactions — which reference the owner's categoryId — render with
  // their real name/color instead of falling out of the hierarchy map.
  const { categories: allCategories, byId: categoryMap } = await getAccessibleCategoryMap({ userId });

  // Get root categories (those without a parent)
  const rootCategories = allCategories.filter((cat) => cat.parentId === null);

  // Determine which category IDs to filter by in the query
  let queryFilterCategoryIds: string[] | undefined;

  if (categoryIds && categoryIds.length > 0) {
    // User selected specific categories - expand to include all descendants so selecting a
    // parent also matches transactions filed directly under its subcategories.
    queryFilterCategoryIds = expandCategoryIdsWithDescendants({
      categoryIds,
      categories: allCategories,
      byId: categoryMap,
    });
  }

  // Build where clause for categories
  const categoryWhere =
    queryFilterCategoryIds && queryFilterCategoryIds.length > 0 ? { [Op.in]: queryFilterCategoryIds } : undefined;

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
        where: { excludeFromStats: false },
        attributes: [],
      },
    ],
    attributes: ['time', 'refAmount', 'transactionType', 'categoryId'],
  });

  // Determine which categories to report in the breakdown
  // If specific categories selected, report those exact categories (not aggregated to root)
  // Otherwise, aggregate to root categories
  let reportCategoryIds: RecordId[];
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
  const targetCategoryIds = aggregateToSelectedCategories ? new Set<string>(categoryIds) : undefined;

  // Aggregate transactions into buckets
  for (const tx of transactions) {
    const txTime = new Date(tx.time);
    const bucketIndex = findBucketIndex({ transactionTime: txTime, buckets });

    if (bucketIndex === -1) continue;

    const periodData = periodDataMap.get(bucketIndex)!;
    const amount = tx.refAmount.toCents();

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
