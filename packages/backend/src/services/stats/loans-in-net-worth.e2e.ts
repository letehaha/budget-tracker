import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { format } from 'date-fns';

// Default loan currency is USD; the test user's base currency must match so refAmount assertions stay in one unit.
const loanPayload = (overrides: Record<string, unknown> = {}) =>
  helpers.buildCreateLoanPayload({ currencyCode: global.BASE_CURRENCY.code, ...overrides });

describe('[Stats] Loans in net worth', () => {
  const today = format(new Date(), 'yyyy-MM-dd');

  it('subtracts a loan balance from the total when the loan is not excluded', async () => {
    await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 10_000 }),
      raw: true,
    });

    const baselineTotal = await helpers.getTotalBalance({ date: today, raw: true });
    expect(baselineTotal).toBe(10_000);

    await helpers.createLoan({
      payload: loanPayload({ initialBalance: 200_000 }),
      raw: true,
    });

    const totalWithLoan = await helpers.getTotalBalance({ date: today, raw: true });
    expect(totalWithLoan).toBe(-190_000);
  });

  it('excludes the loan balance when excludeFromStats is toggled on', async () => {
    await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 10_000 }),
      raw: true,
    });

    const loan = await helpers.createLoan({
      payload: loanPayload({ initialBalance: 200_000 }),
      raw: true,
    });

    await helpers.updateAccount({
      id: loan.id,
      payload: { excludeFromStats: true },
      raw: true,
    });

    const totalAfterExclude = await helpers.getTotalBalance({ date: today, raw: true });
    expect(totalAfterExclude).toBe(10_000);
  });

  it('re-includes the loan balance when excludeFromStats is toggled back off', async () => {
    await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 10_000 }),
      raw: true,
    });

    const loan = await helpers.createLoan({
      payload: loanPayload({ initialBalance: 200_000 }),
      raw: true,
    });

    await helpers.updateAccount({
      id: loan.id,
      payload: { excludeFromStats: true },
      raw: true,
    });
    expect(await helpers.getTotalBalance({ date: today, raw: true })).toBe(10_000);

    await helpers.updateAccount({
      id: loan.id,
      payload: { excludeFromStats: false },
      raw: true,
    });

    const totalAfterReinclude = await helpers.getTotalBalance({ date: today, raw: true });
    expect(totalAfterReinclude).toBe(-190_000);
  });
});
