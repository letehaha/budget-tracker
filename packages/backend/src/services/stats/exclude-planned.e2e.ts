import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addDays, format, subDays } from 'date-fns';

/**
 * The dashboard widgets treat planned rows as part of the picture by default and only drop
 * them when the caller opts out, so the default-path assertions here are as load-bearing as
 * the excludePlanned ones.
 */

const RANGE = () => ({
  from: format(subDays(new Date(), 10), 'yyyy-MM-dd'),
  to: format(addDays(new Date(), 20), 'yyyy-MM-dd'),
});

const REAL_TIME = () => subDays(new Date(), 1).toISOString();
const PLANNED_TIME = () => addDays(new Date(), 5).toISOString();

const seedRealAndPlanned = async () => {
  const account = await helpers.createAccount({ raw: true });

  await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 50,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      time: REAL_TIME(),
    },
    raw: true,
  });
  await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.income,
      }),
      time: REAL_TIME(),
    },
    raw: true,
  });
  await helpers.createPlannedTransaction({
    payload: {
      accountId: account.id,
      amount: 30,
      transactionType: TRANSACTION_TYPES.expense,
      time: PLANNED_TIME(),
    },
    raw: true,
  });
  await helpers.createPlannedTransaction({
    payload: {
      accountId: account.id,
      amount: 70,
      transactionType: TRANSACTION_TYPES.income,
      time: PLANNED_TIME(),
    },
    raw: true,
  });

  return account;
};

const sumTotals = (result: { totals: { income: number; expenses: number } }) => result.totals;

const sumAmounts = (result: Record<string, { amount: number }>) =>
  Object.values(result).reduce((acc, curr) => acc + curr.amount, 0);

const sumBuckets = (result: Record<string, { income: number; expense: number }>) =>
  Object.values(result).reduce(
    (acc, curr) => ({ income: acc.income + curr.income, expense: acc.expense + curr.expense }),
    { income: 0, expense: 0 },
  );

describe('excludePlanned on stats endpoints', () => {
  it('GET /stats/cash-flow honours the default, excludePlanned=true and an explicit excludePlanned=false', async () => {
    await seedRealAndPlanned();

    const byDefault = await helpers.getCashFlow({ ...RANGE(), granularity: 'monthly', raw: true });
    const excluded = await helpers.getCashFlow({
      ...RANGE(),
      granularity: 'monthly',
      excludePlanned: true,
      raw: true,
    });
    const explicitlyIncluded = await helpers.getCashFlow({
      ...RANGE(),
      granularity: 'monthly',
      excludePlanned: false,
      raw: true,
    });

    expect(sumTotals(byDefault)).toMatchObject({ income: 170, expenses: 80 });
    expect(sumTotals(excluded)).toMatchObject({ income: 100, expenses: 50 });
    expect(sumTotals(explicitlyIncluded)).toMatchObject({ income: 170, expenses: 80 });
  }, 60_000);

  it('GET /stats/spendings-by-categories honours excludePlanned in both the flat and the groupByType shape', async () => {
    await seedRealAndPlanned();

    const flatDefault = await helpers.getSpendingsByCategories({ ...RANGE(), raw: true });
    const flatExcluded = await helpers.getSpendingsByCategories({ ...RANGE(), excludePlanned: true, raw: true });
    const byTypeDefault = (await helpers.getSpendingsByCategories({
      ...RANGE(),
      groupByType: true,
      raw: true,
    })) as Record<string, { income: number; expense: number }>;
    const byTypeExcluded = (await helpers.getSpendingsByCategories({
      ...RANGE(),
      groupByType: true,
      excludePlanned: true,
      raw: true,
    })) as Record<string, { income: number; expense: number }>;

    expect(sumAmounts(flatDefault)).toBe(80);
    expect(sumAmounts(flatExcluded)).toBe(50);
    expect(sumBuckets(byTypeDefault)).toEqual({ income: 170, expense: 80 });
    expect(sumBuckets(byTypeExcluded)).toEqual({ income: 100, expense: 50 });
  }, 60_000);

  it('GET /stats/expenses-amount-for-period sums planned expenses by default and drops them on excludePlanned=true', async () => {
    await seedRealAndPlanned();

    const byDefault = await helpers.getExpensesAmountForPeriod({ ...RANGE(), raw: true });
    const excluded = await helpers.getExpensesAmountForPeriod({ ...RANGE(), excludePlanned: true, raw: true });

    expect(byDefault).toBe(80);
    expect(excluded).toBe(50);
  }, 60_000);
});
