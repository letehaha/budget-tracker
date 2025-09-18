import { BalanceModel } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import * as statsService from '@services/stats';
import { isBefore, isEqual, isValid } from 'date-fns';
import { z } from 'zod';

import { createController } from './helpers/controller-factory';

const tryBasicDateValidation = ({ from, to }) => {
  if (from && !isValid(new Date(from))) {
    throw new ValidationError({ message: '"from" is invalid date.' });
  }
  if (to && !isValid(new Date(to))) {
    throw new ValidationError({ message: '"to" is invalid date.' });
  }
  if (from && to && !isEqual(new Date(from), new Date(to)) && !isBefore(new Date(from), new Date(to))) {
    throw new ValidationError({
      message: '"from" cannot be greater than "to" date.',
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

  return { data: balanceHistory };
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
    throw new ValidationError({ message: '"date" is invalid date.' });
  }

  const totalBalance = await statsService.getTotalBalance({
    userId,
    date,
  });

  return { data: totalBalance };
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

  return { data: result };
});

const spendingsByCategoriesSchema = z.object({
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    accountId: z.string().optional(),
  }),
});

export const getSpendingsByCategories = createController(spendingsByCategoriesSchema, async ({ user, query }) => {
  const { id: userId } = user;
  const { from, to, accountId } = query;

  tryBasicDateValidation({ from, to });

  const result = await statsService.getSpendingsByCategories(
    removeUndefinedKeys({
      userId,
      from,
      to,
      accountId: Number(accountId),
    }),
  );

  return { data: result };
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

  return { data: result };
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

  return { data: combinedBalanceHistory };
});
