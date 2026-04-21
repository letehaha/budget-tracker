import { TRANSACTION_TYPES } from '@bt/shared/types';
import { optionalCommaSeparatedIds, recordId } from '@common/lib/zod/custom-types';
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
  serializeSpendingsByCategories,
  serializeTotalBalance,
} from '@root/serializers';
import * as statsService from '@services/stats';
import { getUserSettings } from '@services/user-settings/get-user-settings';
import { isBefore, isEqual, isValid } from 'date-fns';
import z from 'zod';

import { createController } from './helpers/controller-factory';

const tryBasicDateValidation = ({ from, to }) => {
  if (from && !isValid(new Date(from))) {
    throw new ValidationError({ message: t({ key: 'validation.fromDateInvalid' }) });
  }
  if (to && !isValid(new Date(to))) {
    throw new ValidationError({ message: t({ key: 'validation.toDateInvalid' }) });
  }
  if (from && to && !isEqual(new Date(from), new Date(to)) && !isBefore(new Date(from), new Date(to))) {
    throw new ValidationError({
      message: t({ key: 'validation.fromGreaterThanTo' }),
    });
  }
};

const balanceHistorySchema = z.object({
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    accountId: recordId().optional(),
  }),
});

export const getBalanceHistory = createController(balanceHistorySchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, accountId } = query;

  tryBasicDateValidation({ from, to });

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
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    accountId: z.string().optional(),
    type: z.enum(Object.values(TRANSACTION_TYPES)).optional(),
    categoryIds: optionalCommaSeparatedIds(),
    excludedCategoryIds: optionalCommaSeparatedIds(),
  }),
});

export const getSpendingsByCategories = createController(spendingsByCategoriesSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, accountId, type: transactionType, categoryIds, excludedCategoryIds } = query;

  tryBasicDateValidation({ from, to });

  const result = await statsService.getSpendingsByCategories(
    removeUndefinedKeys({
      userId,
      from,
      to,
      accountId: Number(accountId),
      transactionType,
      categoryIds,
      excludedCategoryIds,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeSpendingsByCategories(result) };
});

const expensesAmountSchema = z.object({
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    accountId: z.string().optional(),
    excludedCategoryIds: optionalCommaSeparatedIds(),
  }),
});

export const getExpensesAmountForPeriod = createController(expensesAmountSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, accountId, excludedCategoryIds } = query;

  tryBasicDateValidation({ from, to });

  const result = await statsService.getExpensesAmountForPeriod(
    removeUndefinedKeys({
      userId,
      from,
      to,
      accountId: Number(accountId),
      excludedCategoryIds,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeExpensesAmountForPeriod(result) };
});

const combinedBalanceHistorySchema = z.object({
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }),
});

export const getCombinedBalanceHistory = createController(combinedBalanceHistorySchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to } = query;

  tryBasicDateValidation({ from, to });

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
  query: z.object({
    from: z.string(),
    to: z.string(),
    granularity: z.enum(['monthly', 'biweekly', 'weekly']),
    accountId: z.string().optional(),
    categoryIds: optionalCommaSeparatedIds(),
  }),
});

export const getCashFlow = createController(cashFlowSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, granularity, accountId, categoryIds } = query;

  tryBasicDateValidation({ from, to });

  const result = await statsService.getCashFlow(
    removeUndefinedKeys({
      userId,
      from,
      to,
      granularity,
      accountId: accountId ? Number(accountId) : undefined,
      categoryIds,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeCashFlow(result) };
});

export const getEarliestTransactionDate = createController(z.object({}), async ({ user }) => {
  const date = await statsService.getEarliestTransactionDate({ userId: user.id });
  return { data: date };
});

const cumulativeDataSchema = z.object({
  query: z.object({
    from: z.string(),
    to: z.string(),
    metric: z.enum(['expenses', 'income', 'savings']),
    accountId: z.string().optional(),
  }),
});

export const getCumulativeData = createController(cumulativeDataSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, metric, accountId } = query;

  tryBasicDateValidation({ from, to });

  const result = await statsService.getCumulativeData(
    removeUndefinedKeys({
      userId,
      from,
      to,
      metric,
      accountId: accountId ? Number(accountId) : undefined,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeCumulativeData(result) };
});
