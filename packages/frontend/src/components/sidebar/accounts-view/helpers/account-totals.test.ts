import type { AccountGroups } from '@/common/types/models';
import { AccountModel } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { collectGroupAccounts, sumAccountsBaseBalance } from './account-totals';

// Readable string ids keep the flatten-order assertions legible; the account's
// branded RecordId is loosened here since these fixtures never round-trip through the API.
const makeAccount = (partial: {
  id?: string;
  currentBalance?: number;
  refCurrentBalance?: number;
  creditLimit?: number;
  currencyCode?: string;
}): AccountModel =>
  ({
    currentBalance: 0,
    refCurrentBalance: 0,
    creditLimit: 0,
    currencyCode: 'USD',
    ...partial,
  }) as AccountModel;

const makeGroup = (partial: Partial<AccountGroups>): AccountGroups =>
  ({
    accounts: [],
    childGroups: [],
    ...partial,
  }) as AccountGroups;

describe('sumAccountsBaseBalance', () => {
  it('sums refCurrentBalance across accounts', () => {
    const result = sumAccountsBaseBalance({
      accounts: [
        makeAccount({ refCurrentBalance: 100, currencyCode: 'USD' }),
        makeAccount({ refCurrentBalance: 250.5, currencyCode: 'USD' }),
      ],
      baseCurrencyCode: 'USD',
      includeCreditLimit: false,
    });

    expect(result.total).toBe(350.5);
    expect(result.isApprox).toBe(false);
  });

  it('flags the total as approximate when any account is in a non-base currency', () => {
    const result = sumAccountsBaseBalance({
      accounts: [
        makeAccount({ refCurrentBalance: 100, currencyCode: 'USD' }),
        makeAccount({ refCurrentBalance: 40, currencyCode: 'EUR' }),
      ],
      baseCurrencyCode: 'USD',
      includeCreditLimit: false,
    });

    expect(result.total).toBe(140);
    expect(result.isApprox).toBe(true);
  });

  it('keeps the total exact when every account is already in the base currency', () => {
    const result = sumAccountsBaseBalance({
      accounts: [makeAccount({ refCurrentBalance: 10, currencyCode: 'PLN' })],
      baseCurrencyCode: 'PLN',
      includeCreditLimit: false,
    });

    expect(result.isApprox).toBe(false);
  });

  it('leaves the credit limit out of the total unless the setting is enabled', () => {
    const account = makeAccount({ currentBalance: 200, refCurrentBalance: 200, creditLimit: 500 });

    expect(
      sumAccountsBaseBalance({ accounts: [account], baseCurrencyCode: 'USD', includeCreditLimit: false }).total,
    ).toBe(200);
  });

  it('threads the credit-limit setting through to the base-currency total when enabled', () => {
    // Own balance 200 with a 500 limit -> displayed as -300; refCurrentBalance 400 tracks a 2x FX rate,
    // so the base-currency figure scales to -300 * 2 = -600. (Formula edge cases live in account-balance.test.ts.)
    const account = makeAccount({ currentBalance: 200, refCurrentBalance: 400, creditLimit: 500, currencyCode: 'EUR' });

    expect(
      sumAccountsBaseBalance({ accounts: [account], baseCurrencyCode: 'USD', includeCreditLimit: true }).total,
    ).toBe(-600);
  });

  it('never flags approximate when the base currency is unknown', () => {
    const result = sumAccountsBaseBalance({
      accounts: [makeAccount({ refCurrentBalance: 5, currencyCode: 'EUR' })],
      baseCurrencyCode: undefined,
      includeCreditLimit: false,
    });

    expect(result.isApprox).toBe(false);
  });
});

describe('collectGroupAccounts', () => {
  it("returns a group's own accounts", () => {
    const group = makeGroup({ accounts: [makeAccount({ id: 'a' }), makeAccount({ id: 'b' })] });

    expect(collectGroupAccounts({ group }).map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('flattens accounts nested in descendant groups', () => {
    const group = makeGroup({
      accounts: [makeAccount({ id: 'root' })],
      childGroups: [
        makeGroup({
          accounts: [makeAccount({ id: 'child' })],
          childGroups: [makeGroup({ accounts: [makeAccount({ id: 'grandchild' })] })],
        }),
      ],
    });

    expect(collectGroupAccounts({ group }).map((a) => a.id)).toEqual(['root', 'child', 'grandchild']);
  });
});
