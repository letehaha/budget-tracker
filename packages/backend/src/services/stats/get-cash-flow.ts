import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, endpointsTypes } from '@bt/shared/types';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/Accounts.model';
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
  excludeCategories = false,
}: GetCashFlowParams): Promise<endpointsTypes.GetCashFlowResponse> => {
  // Generate period buckets
  const buckets = generatePeriodBuckets({ from, to, granularity });

  // Initialize period data
  const periodDataMap: Map<number, { income: number; expenses: number }> = new Map();
  buckets.forEach((_, index) => {
    periodDataMap.set(index, { income: 0, expenses: 0 });
  });

  // Get excluded categories if needed
  let excludedCategoryIds: number[] = [];
  if (excludeCategories) {
    const settings = await getUserSettings({ userId });
    excludedCategoryIds = settings.stats.expenses.excludedCategories;
  }

  // Build where clause for categories
  const categoryWhere =
    excludeCategories && excludedCategoryIds.length > 0 ? { [Op.notIn]: excludedCategoryIds } : undefined;

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
    attributes: ['time', 'refAmount', 'transactionType'],
  });

  // Aggregate transactions into buckets
  for (const tx of transactions) {
    const txTime = new Date(tx.time);
    const bucketIndex = findBucketIndex({ transactionTime: txTime, buckets });

    if (bucketIndex === -1) continue;

    const periodData = periodDataMap.get(bucketIndex)!;
    const amount = tx.refAmount;

    if (tx.transactionType === TRANSACTION_TYPES.income) {
      periodData.income += amount;
    } else if (tx.transactionType === TRANSACTION_TYPES.expense) {
      periodData.expenses += amount;
    }
  }

  // Build response periods
  const periods: endpointsTypes.CashFlowPeriodData[] = buckets.map((bucket, index) => {
    const data = periodDataMap.get(index)!;
    return {
      periodStart: format(bucket.periodStart, 'yyyy-MM-dd'),
      periodEnd: format(bucket.periodEnd, 'yyyy-MM-dd'),
      income: data.income,
      expenses: data.expenses,
      netFlow: data.income - data.expenses,
    };
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
