import { BalanceModel, TRANSACTION_TYPES } from '@bt/shared/types';
import { booleanQuery, recordId } from '@common/lib/zod/custom-types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import {
  serializeBalanceHistory,
  serializeCashFlow,
  serializeCombinedBalanceHistory,
  serializeCumulativeData,
  serializeExpensesAmountForPeriod,
  serializeExpensesHistory,
  serializeSpendingsByCategories,
  serializeTotalBalance,
} from '@root/serializers';
import * as statsService from '@services/stats';
import { isBefore, isEqual, isValid } from 'date-fns';
import { z } from 'zod';

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

  let balanceHistory: BalanceModel[];
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

  const totalBalance = await statsService.getTotalBalance({
    userId,
    date,
  });

  // Serialize: convert cents to decimal for API response
  return { data: serializeTotalBalance(totalBalance) };
});

const expensesHistorySchema = z.object({
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    accountId: z.string().optional(),
  }),
});

export const getExpensesHistory = createController(expensesHistorySchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, accountId } = query;

  tryBasicDateValidation({ from, to });

  const result = await statsService.getExpensesHistory(
    removeUndefinedKeys({
      userId,
      from,
      to,
      accountId: Number(accountId),
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeExpensesHistory(result) };
});

const spendingsByCategoriesSchema = z.object({
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    accountId: z.string().optional(),
    type: z.enum(Object.values(TRANSACTION_TYPES)).optional(),
  }),
});

export const getSpendingsByCategories = createController(spendingsByCategoriesSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, accountId, type: transactionType } = query;

  tryBasicDateValidation({ from, to });

  const result = await statsService.getSpendingsByCategories(
    removeUndefinedKeys({
      userId,
      from,
      to,
      accountId: Number(accountId),
      transactionType,
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
  }),
});

export const getExpensesAmountForPeriod = createController(expensesAmountSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, accountId } = query;

  tryBasicDateValidation({ from, to });

  const result = await statsService.getExpensesAmountForPeriod(
    removeUndefinedKeys({
      userId,
      from,
      to,
      accountId: Number(accountId),
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

  const combinedBalanceHistory = await statsService.getCombinedBalanceHistory({
    userId,
    from,
    to,
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
    // Comma-separated category IDs (e.g., "1,2,3")
    categoryIds: z
      .string()
      .optional()
      .transform((val) =>
        val
          ? val
              .split(',')
              .map((id) => Number(id.trim()))
              .filter((id) => !Number.isNaN(id))
          : undefined,
      ),
    excludeCategories: booleanQuery().optional(),
  }),
});

export const getCashFlow = createController(cashFlowSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, granularity, accountId, categoryIds, excludeCategories } = query;

  tryBasicDateValidation({ from, to });

  const result = await statsService.getCashFlow(
    removeUndefinedKeys({
      userId,
      from,
      to,
      granularity,
      accountId: accountId ? Number(accountId) : undefined,
      categoryIds,
      excludeCategories,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeCashFlow(result) };
});

const cumulativeDataSchema = z.object({
  query: z.object({
    from: z.string(),
    to: z.string(),
    metric: z.enum(['expenses', 'income', 'savings']),
    accountId: z.string().optional(),
    excludeCategories: booleanQuery().optional(),
  }),
});

export const getCumulativeData = createController(cumulativeDataSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, metric, accountId, excludeCategories } = query;

  tryBasicDateValidation({ from, to });

  const result = await statsService.getCumulativeData(
    removeUndefinedKeys({
      userId,
      from,
      to,
      metric,
      accountId: accountId ? Number(accountId) : undefined,
      excludeCategories,
    }),
  );

  // Serialize: convert cents to decimal for API response
  return { data: serializeCumulativeData(result) };
});
