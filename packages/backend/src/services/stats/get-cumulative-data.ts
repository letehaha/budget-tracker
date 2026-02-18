import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, endpointsTypes } from '@bt/shared/types';
import { rawCents } from '@common/types/money';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/Accounts.model';
import * as Transactions from '@models/Transactions.model';
import {
  addMonths,
  differenceInMonths,
  endOfMonth,
  format,
  getMonth,
  getYear,
  isBefore,
  isEqual,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { Op } from 'sequelize';

import { getUserSettings } from '../user-settings/get-user-settings';
import { getWhereConditionForTime } from './utils';

interface GetCumulativeDataParams {
  userId: number;
  from: string;
  to: string;
  metric: endpointsTypes.CumulativeMetric;
  accountId?: number;
  excludeCategories?: boolean;
}

type GetPeriodDataParams = GetCumulativeDataParams;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Fetches cumulative data for a date range, calculating running totals per month.
 * Returns data for both the requested period and the immediately preceding period for comparison.
 * (Period-over-Period comparison: e.g., Aug-Oct compared to May-Jul)
 */
export const getCumulativeData = async ({
  userId,
  from,
  to,
  metric,
  accountId,
  excludeCategories = false,
}: GetCumulativeDataParams): Promise<endpointsTypes.GetCumulativeResponse> => {
  // Use parseISO for consistent date parsing (treats dates as local time, not UTC)
  const fromDate = parseISO(from);
  const toDate = parseISO(to);

  // Calculate period length in months (add 1 because both ends are inclusive)
  const periodLengthMonths = differenceInMonths(startOfMonth(toDate), startOfMonth(fromDate)) + 1;

  // Calculate the immediately preceding period of the same length
  // e.g., if selected Aug-Oct (3 months), previous period is May-Jul (3 months before)
  const prevFromDate = subMonths(fromDate, periodLengthMonths);
  const prevToDate = subMonths(toDate, periodLengthMonths);
  const prevFrom = format(prevFromDate, 'yyyy-MM-dd');
  const prevTo = format(prevToDate, 'yyyy-MM-dd');

  const currentPeriodData = await getPeriodData({
    userId,
    from,
    to,
    metric,
    accountId,
    excludeCategories,
  });

  const previousPeriodData = await getPeriodData({
    userId,
    from: prevFrom,
    to: prevTo,
    metric,
    accountId,
    excludeCategories,
  });

  // Calculate period-over-period percent change
  let percentChange = 0;
  if (previousPeriodData.total !== 0) {
    percentChange = Math.round(
      ((currentPeriodData.total - previousPeriodData.total) / Math.abs(previousPeriodData.total)) * 100,
    );
  } else if (currentPeriodData.total > 0) {
    percentChange = 100;
  } else if (currentPeriodData.total < 0) {
    percentChange = -100;
  }

  return {
    currentPeriod: currentPeriodData,
    previousPeriod: previousPeriodData,
    percentChange,
  };
};

async function getPeriodData({
  userId,
  from,
  to,
  metric,
  accountId,
  excludeCategories,
}: GetPeriodDataParams): Promise<endpointsTypes.CumulativePeriodData> {
  // Use parseISO for consistent date parsing (treats dates as local time, not UTC)
  const fromDate = parseISO(from);
  const toDate = parseISO(to);
  const now = new Date();

  // Limit 'to' date to current month if it's in the future
  const effectiveToDate = toDate > now ? endOfMonth(now) : toDate;
  const effectiveTo = format(effectiveToDate, 'yyyy-MM-dd');

  // Get excluded categories if needed
  let excludedCategoryIds: number[] = [];
  if (excludeCategories) {
    const settings = await getUserSettings({ userId });
    excludedCategoryIds = settings.stats.expenses.excludedCategories;
  }

  // Build where clause for categories
  const categoryWhere =
    excludeCategories && excludedCategoryIds.length > 0 ? { [Op.notIn]: excludedCategoryIds } : undefined;

  // Determine which transaction types to fetch based on metric
  const transactionTypes =
    metric === 'savings'
      ? [TRANSACTION_TYPES.income, TRANSACTION_TYPES.expense]
      : metric === 'income'
        ? [TRANSACTION_TYPES.income]
        : [TRANSACTION_TYPES.expense];

  // Fetch transactions
  const transactions = await Transactions.default.findAll({
    where: removeUndefinedKeys({
      accountId,
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      transactionType: {
        [Op.in]: transactionTypes,
      },
      ...(categoryWhere ? { categoryId: categoryWhere } : {}),
      ...getWhereConditionForTime({ from, to: effectiveTo, columnName: 'time' }),
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

  // Build a map of year-month to aggregate values
  const monthlyDataMap = new Map<string, { income: number; expenses: number }>();

  // Aggregate transactions into months
  for (const tx of transactions) {
    const txTime = new Date(tx.time);
    const monthKey = `${getYear(txTime)}-${getMonth(txTime)}`; // year-monthIndex (0-11)

    if (!monthlyDataMap.has(monthKey)) {
      monthlyDataMap.set(monthKey, { income: 0, expenses: 0 });
    }

    const monthEntry = monthlyDataMap.get(monthKey)!;

    if (tx.transactionType === TRANSACTION_TYPES.income) {
      monthEntry.income += rawCents(tx.refAmount);
    } else if (tx.transactionType === TRANSACTION_TYPES.expense) {
      monthEntry.expenses += Math.abs(rawCents(tx.refAmount));
    }
  }

  // Build cumulative data based on metric
  const data: endpointsTypes.CumulativeMonthData[] = [];
  let cumulativeValue = 0;

  // Iterate through each month in the range using date-fns for safe date iteration
  let currentMonth = startOfMonth(fromDate);
  const lastMonth = startOfMonth(effectiveToDate);
  const nowMonth = startOfMonth(now);
  let monthCounter = 1;

  while (isBefore(currentMonth, lastMonth) || isEqual(currentMonth, lastMonth)) {
    // Don't include months in the future
    if (isBefore(nowMonth, currentMonth)) {
      break;
    }

    const monthKey = `${getYear(currentMonth)}-${getMonth(currentMonth)}`;
    const monthData = monthlyDataMap.get(monthKey) || { income: 0, expenses: 0 };
    // getMonth() returns 0-11, which always maps to a valid MONTH_LABELS index
    const monthLabel = MONTH_LABELS[getMonth(currentMonth)]!;

    let periodValue = 0;

    switch (metric) {
      case 'income':
        periodValue = monthData.income;
        break;
      case 'expenses':
        periodValue = monthData.expenses;
        break;
      case 'savings':
        periodValue = monthData.income - monthData.expenses;
        break;
    }

    cumulativeValue += periodValue;

    data.push({
      month: monthCounter,
      monthLabel,
      value: cumulativeValue,
      periodValue,
    });

    // Move to next month using date-fns (safe, no mutation)
    currentMonth = addMonths(currentMonth, 1);
    monthCounter++;
  }

  // Use the year from the 'from' date as the period identifier
  return {
    year: getYear(fromDate),
    data,
    total: cumulativeValue,
  };
}
