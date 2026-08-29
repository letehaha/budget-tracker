import { SUBSCRIPTION_FREQUENCIES, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { subMonths } from 'date-fns';

/**
 * Planned rows are user intentions, not money that moved, so the subscription
 * surfaces that report on real money must ignore them.
 */

/**
 * A date inside the `lookbackMonths: 1` window, which spans exactly the last
 * complete month. subMonths clamps month-end (Jul 31 → Jun 30); a raw setMonth
 * would roll over into the current month and fall out of the window.
 */
const inLastCompleteMonth = ({ day }: { day: number }) => {
  const date = subMonths(new Date(), 1);
  date.setDate(day);
  return date.toISOString();
};

const seedIncomeWithPlannedNoise = async () => {
  const account = await helpers.createAccount({ raw: true });

  // Two real incomes of 100 → 200 of real money in the window.
  for (const day of [10, 15]) {
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.income,
        time: inLastCompleteMonth({ day }),
      }),
      raw: true,
    });
  }

  // A plan dated inside the same window. Never received, so it must not count.
  await helpers.createPlannedTransaction({
    payload: {
      accountId: account.id,
      amount: 500,
      transactionType: TRANSACTION_TYPES.income,
      time: inLastCompleteMonth({ day: 12 }),
    },
    raw: true,
  });

  return account;
};

describe('Subscriptions ignore planned transactions', () => {
  describe('GET /subscriptions/summary', () => {
    it('excludes planned income from averageMonthlyIncome and percentOfIncome', async () => {
      await seedIncomeWithPlannedNoise();

      await helpers.createSubscription({
        name: 'Netflix',
        expectedAmount: 20,
        expectedCurrencyCode: global.BASE_CURRENCY_CODE,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const summary = await helpers.getSubscriptionsSummary({ lookbackMonths: 1, raw: true });

      // seedIncomeWithPlannedNoise books 200 of real income and a 500 planned row in the window.
      expect(summary.averageMonthlyIncome).toBe(200);
      expect(summary.estimatedMonthlyCost).toBe(20);
      // 20 / 200 = 10%
      expect(summary.percentOfIncome).toBe(10);
    });
  });

  describe('GET /subscriptions', () => {
    it('excludes linked planned transactions from linkedTransactionsCount', async () => {
      const account = await helpers.createAccount({ raw: true });

      const mixedSub = await helpers.createSubscription({
        name: 'Gym',
        expectedAmount: 10,
        expectedCurrencyCode: global.BASE_CURRENCY_CODE,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });
      const plannedOnlySub = await helpers.createSubscription({
        name: 'Insurance',
        expectedAmount: 25,
        expectedCurrencyCode: global.BASE_CURRENCY_CODE,
        frequency: SUBSCRIPTION_FREQUENCIES.monthly,
        startDate: '2025-01-01',
        raw: true,
      });

      const [realTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 10 }),
        raw: true,
      });
      const [mixedPlannedTx] = await helpers.createPlannedTransaction({
        payload: {
          accountId: account.id,
          amount: 10,
          transactionType: TRANSACTION_TYPES.expense,
        },
        raw: true,
      });
      const [plannedOnlyTx] = await helpers.createPlannedTransaction({
        payload: {
          accountId: account.id,
          amount: 25,
          transactionType: TRANSACTION_TYPES.expense,
        },
        raw: true,
      });

      await helpers.linkTransactionsToSubscription({
        id: mixedSub.id,
        transactionIds: [realTx.id, mixedPlannedTx.id],
        raw: true,
      });
      await helpers.linkTransactionsToSubscription({
        id: plannedOnlySub.id,
        transactionIds: [plannedOnlyTx.id],
        raw: true,
      });

      const list = await helpers.getSubscriptions({ raw: true });

      const mixed = list.find((item) => item.id === mixedSub.id);
      expect(mixed?.linkedTransactionsCount).toBe(1);

      // Dropping planned rows must not drop the subscription itself from the list.
      const plannedOnly = list.find((item) => item.id === plannedOnlySub.id);
      expect(plannedOnly).toBeDefined();
      expect(plannedOnly?.linkedTransactionsCount).toBe(0);
    }, 60_000);
  });
});
