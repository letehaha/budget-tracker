import { describe, expect, it } from '@jest/globals';

import { DUPLICATE_DATE_WINDOW_DAYS, dayDiff, decimalsEqual } from './detect-duplicates.service';

describe('decimalsEqual', () => {
  it('matches identical strings', () => {
    expect(decimalsEqual({ a: '0.5', b: '0.5' })).toBe(true);
  });

  it('matches formatting variants of the same value', () => {
    expect(decimalsEqual({ a: '0.5', b: '0.50000000' })).toBe(true);
    expect(decimalsEqual({ a: '1000', b: '1000.0' })).toBe(true);
    expect(decimalsEqual({ a: '0.001', b: '0.0010' })).toBe(true);
  });

  it('rejects any non-zero numeric difference (strict, no tolerance)', () => {
    expect(decimalsEqual({ a: '0.5', b: '0.50000001' })).toBe(false);
    expect(decimalsEqual({ a: '1000', b: '1000.01' })).toBe(false);
  });

  it('matches both zero', () => {
    expect(decimalsEqual({ a: '0', b: '0' })).toBe(true);
    expect(decimalsEqual({ a: '0.0', b: '0.0000' })).toBe(true);
  });

  it('rejects one-sided zero', () => {
    expect(decimalsEqual({ a: '0', b: '0.5' })).toBe(false);
  });

  it('handles high-precision decimals', () => {
    expect(decimalsEqual({ a: '0.000000001', b: '0.000000001' })).toBe(true);
    expect(decimalsEqual({ a: '0.000000001', b: '0.000000002' })).toBe(false);
  });
});

describe('dayDiff', () => {
  it('returns 0 for the same day', () => {
    expect(dayDiff({ a: '2024-01-15', b: '2024-01-15' })).toBe(0);
  });

  it('is symmetric and returns the absolute distance', () => {
    expect(dayDiff({ a: '2024-01-15', b: '2024-01-18' })).toBe(3);
    expect(dayDiff({ a: '2024-01-18', b: '2024-01-15' })).toBe(3);
  });

  it('spans month boundaries correctly', () => {
    expect(dayDiff({ a: '2024-01-30', b: '2024-02-02' })).toBe(3);
  });

  it('spans year boundaries correctly', () => {
    expect(dayDiff({ a: '2023-12-30', b: '2024-01-02' })).toBe(3);
  });

  it('agrees with DUPLICATE_DATE_WINDOW_DAYS at the boundary', () => {
    // Trades 3 days apart should be inside the window; 4 days apart should not.
    expect(dayDiff({ a: '2024-01-15', b: '2024-01-18' })).toBeLessThanOrEqual(DUPLICATE_DATE_WINDOW_DAYS);
    expect(dayDiff({ a: '2024-01-15', b: '2024-01-19' })).toBeGreaterThan(DUPLICATE_DATE_WINDOW_DAYS);
  });

  it('is unaffected by DST shifts (everything anchored to UTC midnight)', () => {
    // 2024-03-09 → 2024-03-10 crosses US DST in some zones — should still be 1.
    expect(dayDiff({ a: '2024-03-09', b: '2024-03-10' })).toBe(1);
  });
});
