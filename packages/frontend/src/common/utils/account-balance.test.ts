import { describe, expect, it } from 'vitest';

import { computeAccountDisplayBalances } from './account-balance';

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
