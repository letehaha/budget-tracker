import type { AccountGroups } from '@/common/types/models';
import { AccountModel } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { groupHasVisibleAccount, isZeroBalanceAccount } from './zero-balance';

const makeAccount = (partial: {
  id?: string;
  currentBalance?: number;
  refCurrentBalance?: number;
  creditLimit?: number;
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

describe('isZeroBalanceAccount', () => {
  it('treats a zero display balance as zero', () => {
    expect(isZeroBalanceAccount({ account: makeAccount({ currentBalance: 0 }), includeCreditLimit: false })).toBe(true);
  });

  it('treats any non-zero balance as non-zero', () => {
    expect(isZeroBalanceAccount({ account: makeAccount({ currentBalance: 10 }), includeCreditLimit: false })).toBe(
      false,
    );
    expect(isZeroBalanceAccount({ account: makeAccount({ currentBalance: -0.5 }), includeCreditLimit: false })).toBe(
      false,
    );
  });

  it('is not fooled by a credit account sitting at zero balance (its display balance is negative)', () => {
    // Zero own balance with a 500 limit displays as -500 when the credit-limit setting is on —
    // a real balance, so it must not be hidden as "zero".
    const creditAccount = makeAccount({ currentBalance: 0, creditLimit: 500 });

    expect(isZeroBalanceAccount({ account: creditAccount, includeCreditLimit: true })).toBe(false);
    // With the setting off the limit is ignored, so the same account reads as zero.
    expect(isZeroBalanceAccount({ account: creditAccount, includeCreditLimit: false })).toBe(true);
  });
});

describe('groupHasVisibleAccount', () => {
  it('is false when every account in the subtree is zero', () => {
    const group = makeGroup({
      accounts: [makeAccount({ id: 'a' }), makeAccount({ id: 'b' })],
      childGroups: [makeGroup({ accounts: [makeAccount({ id: 'c' })] })],
    });

    expect(groupHasVisibleAccount({ group, includeCreditLimit: false })).toBe(false);
  });

  it('is true when a direct account is non-zero', () => {
    const group = makeGroup({ accounts: [makeAccount({ id: 'a' }), makeAccount({ id: 'b', currentBalance: 5 })] });

    expect(groupHasVisibleAccount({ group, includeCreditLimit: false })).toBe(true);
  });

  it('is true when only a nested descendant account is non-zero', () => {
    const group = makeGroup({
      accounts: [makeAccount({ id: 'root' })],
      childGroups: [
        makeGroup({
          accounts: [makeAccount({ id: 'child' })],
          childGroups: [makeGroup({ accounts: [makeAccount({ id: 'grandchild', currentBalance: 1 })] })],
        }),
      ],
    });

    expect(groupHasVisibleAccount({ group, includeCreditLimit: false })).toBe(true);
  });
});
