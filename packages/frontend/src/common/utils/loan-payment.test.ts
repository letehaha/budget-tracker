import { describe, expect, it } from 'vitest';

import { getMaxLoanPayment, isLoanOverpayment } from './loan-payment';

describe('getMaxLoanPayment', () => {
  it('returns the magnitude of a negative (owed) loan balance', () => {
    expect(getMaxLoanPayment({ loanCurrentBalance: -49000 })).toBe(49000);
  });

  it('credits an existing payment leg back into the allowance when editing', () => {
    // Editing a $1,000 payment on a loan that still owes $49,000: the cap is
    // $50,000 so the user can raise the same payment without a false overpay.
    expect(getMaxLoanPayment({ loanCurrentBalance: -49000, existingLegAmount: 1000 })).toBe(50000);
  });

  it('treats a missing existing leg as zero', () => {
    expect(getMaxLoanPayment({ loanCurrentBalance: -250 })).toBe(250);
  });
});

describe('isLoanOverpayment', () => {
  it('is false when the amount is below the cap', () => {
    expect(isLoanOverpayment({ amount: 1000, maxPayment: 49000 })).toBe(false);
  });

  it('is false for an exact payoff', () => {
    expect(isLoanOverpayment({ amount: 49000, maxPayment: 49000 })).toBe(false);
  });

  it('tolerates sub-cent float drift at the boundary', () => {
    expect(isLoanOverpayment({ amount: 49000.004, maxPayment: 49000 })).toBe(false);
  });

  it('is true once the amount clears the cap past the slack', () => {
    expect(isLoanOverpayment({ amount: 49000.01, maxPayment: 49000 })).toBe(true);
    expect(isLoanOverpayment({ amount: 60000, maxPayment: 49000 })).toBe(true);
  });

  it('is false for a non-finite amount (defer to the required-field rule)', () => {
    expect(isLoanOverpayment({ amount: Number.NaN, maxPayment: 49000 })).toBe(false);
  });
});
