import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import Balances from '@models/Balances.model';
import * as helpers from '@tests/helpers';
import { format, startOfMonth, subDays } from 'date-fns';

import { CombinedBalanceHistoryItem } from './get-combined-balance-history';

describe('[Stats] Combined balance history', () => {
  it('Returns correct combined balance data for accounts only', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });

    // Create transactions to generate balance history
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.income,
        time: subDays(new Date(), 1).toISOString(),
      }),
      raw: true,
    });

    const data = await helpers.getCombinedBalanceHistory({ raw: true });

    const record = data[0]!;

    expect(data.length).toBeGreaterThan(0);
    // Should have account balance data
    expect(record).toHaveProperty('accountsBalance');
    expect(record).toHaveProperty('portfoliosBalance', 0);
    expect(record).toHaveProperty('totalBalance');
    expect(record.totalBalance).toBe(record.accountsBalance + record.portfoliosBalance);
  });

  it('Returns correct combined balance data with date filtering', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });

    // Create transactions spanning multiple days
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.income,
        time: subDays(new Date(), 3).toISOString(),
      }),
      raw: true,
    });

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.income,
        time: subDays(new Date(), 1).toISOString(),
      }),
      raw: true,
    });

    // Filter to get data from specific date range
    const fromDate = format(subDays(new Date(), 4), 'yyyy-MM-dd');
    const toDate = format(subDays(new Date(), 2), 'yyyy-MM-dd');

    const data = await helpers.getCombinedBalanceHistory({
      from: fromDate,
      to: toDate,
      raw: true,
    });

    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('accountsBalance');
    expect(data[0]).toHaveProperty('portfoliosBalance', 0);
    expect(data[0]).toHaveProperty('totalBalance');
  });

  it('Returns correct combined balance data for multiple accounts', async () => {
    const account1 = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });
    const account2 = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 2000 }),
      raw: true,
    });

    // Create transactions for both accounts
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account1.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.income,
        time: subDays(new Date(), 1).toISOString(),
      }),
      raw: true,
    });

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account2.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.income,
        time: subDays(new Date(), 1).toISOString(),
      }),
      raw: true,
    });

    const data = await helpers.getCombinedBalanceHistory({ raw: true });

    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('accountsBalance');
    expect(data[0]).toHaveProperty('portfoliosBalance', 0);
    expect(data[0]).toHaveProperty('totalBalance');
    // Should aggregate both accounts
    expect(data[0]!.accountsBalance).toBeGreaterThan(1000); // Should include both accounts
  });

  it('Returns empty array when no data exists', async () => {
    const data = await helpers.getCombinedBalanceHistory({ raw: true });
    expect(data).toEqual([]);
  });

  it('Validates date parameters', async () => {
    const response = await helpers.makeRequest({
      method: 'get',
      url: '/stats/combined-balance-history?from=invalid-date',
    });

    expect(response.statusCode).toBe(422);
  });

  it('Returns correct balance for today even when no Balance record exists for today', async () => {
    // Create an account (this auto-creates a Balance record for today)
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        initialBalance: 1000,
      }),
      raw: true,
    });

    // Update the balance record's date to yesterday to simulate the scenario
    // where balance exists for yesterday but not for today
    const yesterday = subDays(new Date(), 1);
    yesterday.setHours(0, 0, 0, 0);

    await Balances.update({ date: yesterday }, { where: { accountId: account.id } });

    // Get combined balance history for the last month (which should include today)
    const fromDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const toDate = format(new Date(), 'yyyy-MM-dd');

    const data = await helpers.getCombinedBalanceHistory({
      from: fromDate,
      to: toDate,
      raw: true,
    });

    expect(data.length).toBeGreaterThan(0);

    const todayDate = toDate;
    const yesterdayDate = format(yesterday, 'yyyy-MM-dd');

    // Verify yesterday's entry exists with balance 1000
    const yesterdayEntry = data.find((item: CombinedBalanceHistoryItem) => item.date === yesterdayDate)!;
    expect(yesterdayEntry).toBeDefined();
    expect(yesterdayEntry.accountsBalance).toBe(1000);

    // Find today's entry - this is the key test
    const todayEntry = data.find((item: CombinedBalanceHistoryItem) => item.date === todayDate)!;

    // Today should have a balance entry (this is what's failing in production)
    expect(todayEntry).toBeDefined();

    // Today's balance should be 1000 (carried forward from yesterday)
    // This is the bug: it returns 0 instead of 1000
    expect(todayEntry.accountsBalance).toBe(1000);
    expect(todayEntry.totalBalance).toBe(1000);
  });
});
