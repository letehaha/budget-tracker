import { describe, expect, it } from 'vitest';

import { getMaxLoanPayment, isLoanOverpayment, isLoanPaymentPreAnchor } from './loan-payment';

describe('getMaxLoanPayment', () => {
  it('returns the magnitude of a negative (owed) loan balance', () => {
    expect(getMaxLoanPayment({ loanCurrentBalance: -49000 })).toBe(49000);
  });

  it('credits an existing payment leg back into the allowance when editing', () => {
    // $49,000 owed + $1,000 existing leg = $50,000 cap, so raising to it isn't a false overpay.
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

describe('isLoanPaymentPreAnchor', () => {
  it('is true when the payment date is strictly before the anchor date', () => {
    expect(
      isLoanPaymentPreAnchor({ paymentDate: new Date('2026-01-14T10:00:00Z'), balanceAnchorDate: '2026-01-15' }),
    ).toBe(true);
  });

  it('is false when the payment date equals the anchor date (counted, not exempt)', () => {
    expect(
      isLoanPaymentPreAnchor({ paymentDate: new Date('2026-01-15T00:00:00'), balanceAnchorDate: '2026-01-15' }),
    ).toBe(false);
  });

  it('is false when the payment date is after the anchor date', () => {
    expect(
      isLoanPaymentPreAnchor({ paymentDate: new Date('2026-02-01T10:00:00'), balanceAnchorDate: '2026-01-15' }),
    ).toBe(false);
  });

  it('accepts an ISO date string for the payment date', () => {
    expect(isLoanPaymentPreAnchor({ paymentDate: '2026-01-14', balanceAnchorDate: '2026-01-15' })).toBe(true);
  });

  it('is false when the anchor date is unknown (null/undefined)', () => {
    expect(isLoanPaymentPreAnchor({ paymentDate: new Date('2020-01-01'), balanceAnchorDate: null })).toBe(false);
    expect(isLoanPaymentPreAnchor({ paymentDate: new Date('2020-01-01'), balanceAnchorDate: undefined })).toBe(false);
  });

  it('is false when the payment date is missing', () => {
    expect(isLoanPaymentPreAnchor({ paymentDate: null, balanceAnchorDate: '2026-01-15' })).toBe(false);
  });
});
