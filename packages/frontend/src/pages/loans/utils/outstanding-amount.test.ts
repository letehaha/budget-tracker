import { describe, expect, it } from 'vitest';

import { outstandingAmount } from './outstanding-amount';

describe('outstandingAmount', () => {
  it('returns the magnitude of a negative (liability) balance', () => {
    expect(outstandingAmount({ balance: -200 })).toBe(200);
    expect(outstandingAmount({ balance: -0.01 })).toBe(0.01);
  });

  it('returns 0 for a zero balance (settled loan)', () => {
    expect(outstandingAmount({ balance: 0 })).toBe(0);
  });

  it('returns 0 for a positive balance instead of treating credit as debt', () => {
    expect(outstandingAmount({ balance: 200 })).toBe(0);
  });
});
