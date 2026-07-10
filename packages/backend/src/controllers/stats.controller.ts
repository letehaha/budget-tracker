import { TRANSACTION_TYPES, endpointsTypes } from '@bt/shared/types';
import {
  booleanQuery,
  dateRange,
  optionalCommaSeparatedIds,
  recordId,
  withDateOrder,
} from '@common/lib/zod/custom-types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import type Balances from '@models/balances.model';
import {
  serializeBalanceHistory,
  serializeCashFlow,
  serializeCombinedBalanceHistory,
  serializeCumulativeData,
  serializeExpensesAmountForPeriod,
  serializePivotReport,
  serializeSpendingsByCategories,
  serializeSpendingsByCategoriesByType,
  serializeTotalBalance,
} from '@root/serializers';
import * as statsService from '@services/stats';
import { getUserSettings } from '@services/user-settings/get-user-settings';
import { isValid } from 'date-fns';
import { z } from 'zod';

import { createController } from './helpers/controller-factory';

const balanceHistorySchema = z.object({
  query: withDateOrder(z.object({ ...dateRange(), accountId: recordId().optional() })),
});

export const getBalanceHistory = createController(balanceHistorySchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, accountId } = query;

  let balanceHistory: Balances[];
  if (accountId) {
    balanceHistory = await statsService.getBalanceHistoryForAccount({
      userId,
      from,
      to,
      accountId,
    });
  } else {
    balanceHistory = await statsService.getBalanceHistory({
      userId,
      from,
      to,
    });
  }

  // Serialize: convert cents to decimal for API response
  return { data: serializeBalanceHistory(balanceHistory) };
});

const totalBalanceSchema = z.object({
  query: z.object({
    date: z.string(),
  }),
});

export const getTotalBalance = createController(totalBalanceSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { date } = query;

  if (!isValid(new Date(date))) {
    throw new ValidationError({ message: t({ key: 'validation.dateInvalid' }) });
  }

  const settings = await getUserSettings({ userId });

  const totalBalance = await statsService.getTotalBalance({
    userId,
    date,
    includeCreditLimit: settings.includeCreditLimitInStats,
  });

  // Serialize: convert cents to decimal for API response
  return { data: serializeTotalBalance(totalBalance) };
});

const spendingsByCategoriesSchema = z.object({
  query: withDateOrder(
    z.object({
      ...dateRange(),
      accountId: z.string().optional(),
      type: z.enum(Object.values(TRANSACTION_TYPES)).optional(),
      categoryIds: optionalCommaSeparatedIds(),
      excludedCategoryIds: optionalCommaSeparatedIds(),
      // When true, ignores `type` and returns per-category income + expense buckets in one response.
      groupByType: booleanQuery().optional(),
    }),
  ),
});

export const getSpendingsByCategories = createController(spendingsByCategoriesSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, accountId, type: transactionType, categoryIds, excludedCategoryIds, groupByType } = query;

  if (groupByType) {
    const byType = await statsService.getSpendingsByCategoriesByType(
      removeUndefinedKeys({
        userId,
        from,
        to,
        accountId,
        categoryIds,
        excludedCategoryIds,
      }),
    );

    // Serialize: convert cents to decimal for API response
    return { data: serializeSpendingsByCategoriesByType(byType) };
  }

  const result = await statsService.getSpendingsByCategories(
    removeUndefinedKeys({
      userId,
      from,
      to,
      accountId,
      transactionType,
      categoryIds,
      excludedCategoryIds,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeSpendingsByCategories(result) };
});

const expensesAmountSchema = z.object({
  query: withDateOrder(
    z.object({
      ...dateRange(),
      accountId: z.string().optional(),
      excludedCategoryIds: optionalCommaSeparatedIds(),
    }),
  ),
});

export const getExpensesAmountForPeriod = createController(expensesAmountSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, accountId, excludedCategoryIds } = query;

  const result = await statsService.getExpensesAmountForPeriod(
    removeUndefinedKeys({
      userId,
      from,
      to,
      accountId,
      excludedCategoryIds,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeExpensesAmountForPeriod(result) };
});

const combinedBalanceHistorySchema = z.object({
  query: withDateOrder(z.object({ ...dateRange() })),
});

export const getCombinedBalanceHistory = createController(combinedBalanceHistorySchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to } = query;

  const settings = await getUserSettings({ userId });

  const combinedBalanceHistory = await statsService.getCombinedBalanceHistory({
    userId,
    from,
    to,
    includeCreditLimit: settings.includeCreditLimitInStats,
  });

  // Serialize: convert cents to decimal for API response
  return { data: serializeCombinedBalanceHistory(combinedBalanceHistory) };
});

const cashFlowSchema = z.object({
  query: withDateOrder(
    z.object({
      ...dateRange({ required: true }),
      granularity: z.enum(['monthly', 'biweekly', 'weekly']),
      accountId: z.string().optional(),
      categoryIds: optionalCommaSeparatedIds(),
    }),
  ),
});

export const getCashFlow = createController(cashFlowSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, granularity, accountId, categoryIds } = query;

  const result = await statsService.getCashFlow(
    removeUndefinedKeys({
      userId,
      from,
      to,
      granularity,
      accountId,
      categoryIds,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeCashFlow(result) };
});

const pivotReportSchema = z.object({
  query: withDateOrder(
    z.object({
      ...dateRange({ required: true }),
      granularity: z.enum(endpointsTypes.PIVOT_GRANULARITIES),
      rowDimension: z.enum(endpointsTypes.PIVOT_ROW_DIMENSIONS),
      measure: z.enum(endpointsTypes.PIVOT_MEASURES),
      accountIds: optionalCommaSeparatedIds(),
      categoryIds: optionalCommaSeparatedIds(),
      payeeIds: optionalCommaSeparatedIds(),
    }),
  ),
});

export const getPivotReport = createController(pivotReportSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, granularity, rowDimension, measure, accountIds, categoryIds, payeeIds } = query;

  const result = await statsService.getPivotReport(
    removeUndefinedKeys({
      userId,
      from,
      to,
      granularity,
      rowDimension,
      measure,
      accountIds,
      categoryIds,
      payeeIds,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializePivotReport(result) };
});

export const getEarliestTransactionDate = createController(z.object({}), async ({ user }) => {
  const date = await statsService.getEarliestTransactionDate({ userId: user.id });
  return { data: date };
});

const cumulativeDataSchema = z.object({
  query: withDateOrder(
    z.object({
      ...dateRange({ required: true }),
      metric: z.enum(['expenses', 'income', 'savings']),
      accountId: z.string().optional(),
    }),
  ),
});

export const getCumulativeData = createController(cumulativeDataSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, metric, accountId } = query;

  const result = await statsService.getCumulativeData(
    removeUndefinedKeys({
      userId,
      from,
      to,
      metric,
      accountId: accountId ?? undefined,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeCumulativeData(result) };
});
