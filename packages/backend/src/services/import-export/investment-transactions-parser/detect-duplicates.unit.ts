import { describe, expect, it } from '@jest/globals';

import { DUPLICATE_QUANTITY_TOLERANCE, quantitiesMatch } from './detect-duplicates.service';

describe('quantitiesMatch', () => {
  const tolerance = DUPLICATE_QUANTITY_TOLERANCE;

  it('matches identical quantities', () => {
    expect(quantitiesMatch({ a: '0.5', b: '0.5', tolerance })).toBe(true);
  });

  it('matches within tight tolerance — formatting rounding', () => {
    expect(quantitiesMatch({ a: '0.5', b: '0.50000001', tolerance })).toBe(true);
    expect(quantitiesMatch({ a: '0.001', b: '0.00100000', tolerance })).toBe(true);
  });

  it('rejects quantities outside tolerance', () => {
    // 0.001 vs 0.002 = 100% diff, well above the 0.01% tolerance.
    expect(quantitiesMatch({ a: '0.001', b: '0.002', tolerance })).toBe(false);
  });

  it('matches both zero', () => {
    expect(quantitiesMatch({ a: '0', b: '0', tolerance })).toBe(true);
  });

  it('rejects one-sided zero', () => {
    expect(quantitiesMatch({ a: '0', b: '0.5', tolerance })).toBe(false);
    expect(quantitiesMatch({ a: '0.5', b: '0', tolerance })).toBe(false);
  });

  it('handles large numbers', () => {
    expect(quantitiesMatch({ a: '1000000', b: '1000000.1', tolerance })).toBe(true);
    expect(quantitiesMatch({ a: '1000000', b: '1001000', tolerance })).toBe(false);
  });

  it('handles high-precision decimals', () => {
    expect(quantitiesMatch({ a: '0.000000001', b: '0.000000001', tolerance })).toBe(true);
  });
});
