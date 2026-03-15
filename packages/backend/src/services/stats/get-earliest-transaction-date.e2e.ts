import { TRANSACTION_TYPES } from '@bt/shared/types';
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
});
