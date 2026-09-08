import { describe, expect, it } from 'vitest';

import { computeAccountDisplayBalances, computeCreditUsed } from './account-balance';

describe('computeCreditUsed', () => {
  it('derives used from limit minus balance when the balance includes the limit', () => {
    expect(computeCreditUsed({ balance: 4000, creditLimit: 5000, balanceIncludesCreditLimit: true })).toBe(1000);
  });

  it('treats a raw balance as direct debt: negative balance is the used amount', () => {
    expect(computeCreditUsed({ balance: -275, creditLimit: 150_000, balanceIncludesCreditLimit: false })).toBe(275);
  });

  it('reads a raw zero balance as an untouched card', () => {
    expect(computeCreditUsed({ balance: 0, creditLimit: 150_000, balanceIncludesCreditLimit: false })).toBe(0);
  });

  it('clamps to zero when own money sits on top of the limit', () => {
    expect(computeCreditUsed({ balance: 6000, creditLimit: 5000, balanceIncludesCreditLimit: true })).toBe(0);
    expect(computeCreditUsed({ balance: 500, creditLimit: 5000, balanceIncludesCreditLimit: false })).toBe(0);
  });
});

describe('computeAccountDisplayBalances', () => {
  const account = { currentBalance: 200, refCurrentBalance: 400, creditLimit: 500, refCreditLimit: 1000 };

  it('returns the raw balances when the credit-limit setting is off', () => {
    expect(computeAccountDisplayBalances({ ...account, includeCreditLimit: false })).toEqual({
      hasCreditLimitAdjustment: false,
      displayBalance: 200,
      displayRefBalance: 400,
    });
  });

  it('does not adjust an account without a credit limit even when the setting is on', () => {
    expect(
      computeAccountDisplayBalances({ ...account, creditLimit: 0, refCreditLimit: 0, includeCreditLimit: true }),
    ).toEqual({ hasCreditLimitAdjustment: false, displayBalance: 200, displayRefBalance: 400 });
  });

  it('subtracts the native limit from the native balance and the ref limit from the ref balance', () => {
    expect(computeAccountDisplayBalances({ ...account, includeCreditLimit: true })).toEqual({
      hasCreditLimitAdjustment: true,
      displayBalance: -300,
      displayRefBalance: -600,
    });
  });

  it('shows a fully drawn card (zero native balance) as minus the limit in both currencies', () => {
    expect(
      computeAccountDisplayBalances({ ...account, currentBalance: 0, refCurrentBalance: 0, includeCreditLimit: true }),
    ).toEqual({ hasCreditLimitAdjustment: true, displayBalance: -500, displayRefBalance: -1000 });
  });
});
