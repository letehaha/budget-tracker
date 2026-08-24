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
  it('returns the raw balances when the credit-limit setting is off', () => {
    const result = computeAccountDisplayBalances({
      currentBalance: 200,
      refCurrentBalance: 400,
      creditLimit: 500,
      includeCreditLimit: false,
    });

    expect(result).toEqual({ hasCreditLimitAdjustment: false, displayBalance: 200, displayRefBalance: 400 });
  });

  it('does not adjust an account without a credit limit even when the setting is on', () => {
    const result = computeAccountDisplayBalances({
      currentBalance: 200,
      refCurrentBalance: 400,
      creditLimit: 0,
      includeCreditLimit: true,
    });

    expect(result).toEqual({ hasCreditLimitAdjustment: false, displayBalance: 200, displayRefBalance: 400 });
  });

  it('subtracts the credit limit and scales the base-currency figure by the same FX ratio', () => {
    // Own balance 200 with a 500 limit -> -300; refCurrentBalance 400 tracks a 2x rate, so base = -600.
    const result = computeAccountDisplayBalances({
      currentBalance: 200,
      refCurrentBalance: 400,
      creditLimit: 500,
      includeCreditLimit: true,
    });

    expect(result).toEqual({ hasCreditLimitAdjustment: true, displayBalance: -300, displayRefBalance: -600 });
  });

  it('guards the zero-balance case so the base figure never divides by zero', () => {
    const result = computeAccountDisplayBalances({
      currentBalance: 0,
      refCurrentBalance: 0,
      creditLimit: 500,
      includeCreditLimit: true,
    });

    expect(result.hasCreditLimitAdjustment).toBe(true);
    expect(result.displayBalance).toBe(-500);
    expect(result.displayRefBalance).toBe(0);
  });
});
