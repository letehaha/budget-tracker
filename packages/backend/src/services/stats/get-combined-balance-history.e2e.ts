import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { format, subDays } from 'date-fns';

describe('[Stats] Combined balance history', () => {
  it('Returns correct combined balance data for accounts only', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true
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

    expect(data.length).toBeGreaterThan(0);
    // Should have account balance data
    expect(data[0]).toHaveProperty('accountsBalance');
    expect(data[0]).toHaveProperty('portfoliosBalance', 0);
    expect(data[0]).toHaveProperty('totalBalance');
    expect(data[0].totalBalance).toBe(data[0].accountsBalance + data[0].portfoliosBalance);
  });

  it('Returns correct combined balance data with date filtering', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true
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
      raw: true
    });
    const account2 = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 2000 }),
      raw: true
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
    expect(data[0].accountsBalance).toBeGreaterThan(1000); // Should include both accounts
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

});