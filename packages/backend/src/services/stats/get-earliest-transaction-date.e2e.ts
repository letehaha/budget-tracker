import { TRANSACTION_TYPES, asDecimal } from '@bt/shared/types';
import * as helpers from '@tests/helpers';
import { format, subDays } from 'date-fns';

describe('[Stats] Get earliest transaction date', () => {
  it('Returns null when user has no transactions', async () => {
    const result = await helpers.getEarliestTransactionDate({ raw: true });

    expect(result).toBeNull();
  });

  it('Returns the date of the oldest transaction', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 0 }),
      raw: true,
    });

    const oldestDate = subDays(new Date(), 30);
    const newerDate = subDays(new Date(), 10);

    // Create a newer transaction first
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.expense,
        time: newerDate.toISOString(),
      }),
      raw: true,
    });

    // Create the oldest transaction
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
        time: oldestDate.toISOString(),
      }),
      raw: true,
    });

    const result = await helpers.getEarliestTransactionDate({ raw: true });

    expect(result).toBe(format(oldestDate, 'yyyy-MM-dd'));
  });

  it('Returns null when the user only has planned transactions', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 0 }),
      raw: true,
    });

    await helpers.createPlannedTransaction({
      payload: {
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
        time: subDays(new Date(), 40).toISOString(),
      },
      raw: true,
    });

    const result = await helpers.getEarliestTransactionDate({ raw: true });

    expect(result).toBeNull();
  });

  it('Ignores a planned transaction dated before every real one', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 0 }),
      raw: true,
    });

    const oldestRealDate = subDays(new Date(), 30);

    await helpers.createPlannedTransaction({
      payload: {
        accountId: account.id,
        amount: 50,
        transactionType: TRANSACTION_TYPES.expense,
        time: subDays(new Date(), 90).toISOString(),
      },
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
        time: oldestRealDate.toISOString(),
      }),
      raw: true,
    });

    const result = await helpers.getEarliestTransactionDate({ raw: true });

    expect(result).toBe(format(oldestRealDate, 'yyyy-MM-dd'));
  });

  it('Returns the date of a backdated balance adjustment older than every plain transaction', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });

    const plainDate = subDays(new Date(), 20);
    const adjustmentDate = subDays(new Date(), 60);

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
        time: plainDate.toISOString(),
      }),
      raw: true,
    });

    await helpers.balanceAdjustment({
      id: account.id,
      payload: { targetBalance: asDecimal(700), time: adjustmentDate.toISOString() },
      raw: true,
    });

    const result = await helpers.getEarliestTransactionDate({ raw: true });

    expect(result).toBe(format(adjustmentDate, 'yyyy-MM-dd'));
  });
});
