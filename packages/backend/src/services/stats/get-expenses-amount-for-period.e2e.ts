import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('[Stats] Get expenses amount for period', () => {
  it('returns correct total for a period', async () => {
    const account = await helpers.createAccount({ raw: true });
    const payload = helpers.buildTransactionPayload({
      accountId: account.id,
      amount: 100,
      time: new Date('2025-01-15').toISOString(),
    });

    await helpers.createTransaction({ payload, raw: true });
    await helpers.createTransaction({ payload, raw: true });

    const amount = await helpers.getExpensesAmountForPeriod({
      from: '2025-01-01',
      to: '2025-01-31',
      raw: true,
    });

    expect(amount).toBe(200);
  });
});
