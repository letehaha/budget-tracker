import { TRANSACTION_TYPES, asDecimal } from '@bt/shared/types';
import * as helpers from '@tests/helpers';
import { format, subDays } from 'date-fns';

describe('[Stats] Get earliest transaction date', () => {
  it('reports the oldest real transaction date as the account fills up, ignoring planned rows', async () => {
    expect(await helpers.getEarliestTransactionDate({ raw: true })).toBeNull();

    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 0 }),
      raw: true,
    });

    const plannedDate = subDays(new Date(), 90);
    await helpers.createPlannedTransaction({
      payload: {
        accountId: account.id,
        amount: 50,
        transactionType: TRANSACTION_TYPES.expense,
        time: plannedDate.toISOString(),
      },
      raw: true,
    });

    expect(await helpers.getEarliestTransactionDate({ raw: true })).toBeNull();

    const newerDate = subDays(new Date(), 10);
    const oldestRealDate = subDays(new Date(), 30);

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.expense,
        time: newerDate.toISOString(),
      }),
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

    // The planned row is older than both real ones and still must not win.
    expect(await helpers.getEarliestTransactionDate({ raw: true })).toBe(format(oldestRealDate, 'yyyy-MM-dd'));

    const adjustmentDate = subDays(new Date(), 60);
    await helpers.balanceAdjustment({
      id: account.id,
      payload: { targetBalance: asDecimal(700), time: adjustmentDate.toISOString() },
      raw: true,
    });

    expect(await helpers.getEarliestTransactionDate({ raw: true })).toBe(format(adjustmentDate, 'yyyy-MM-dd'));
  }, 60_000);
});
