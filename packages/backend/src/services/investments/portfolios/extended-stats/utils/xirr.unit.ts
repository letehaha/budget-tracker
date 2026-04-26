import { describe, expect, it } from '@jest/globals';

import { calculateXirr } from './xirr';

describe('calculateXirr', () => {
  it('returns null with fewer than 2 cash flows', () => {
    expect(calculateXirr({ cashFlows: [] })).toBeNull();
    expect(calculateXirr({ cashFlows: [{ date: '2024-01-01', amount: -1000 }] })).toBeNull();
  });

  it('returns null when all cash flows have the same sign', () => {
    expect(
      calculateXirr({
        cashFlows: [
          { date: '2024-01-01', amount: -1000 },
          { date: '2024-06-01', amount: -2000 },
        ],
      }),
    ).toBeNull();
  });

  // Use a non-leap-year window (2025→2026, both 365 days) so 1-year intervals
  // are exactly 1.0 in years-from-anchor — matching Excel XIRR's expected output.
  it('solves a flat 1-year doubling: 100% IRR', () => {
    const result = calculateXirr({
      cashFlows: [
        { date: '2025-01-01', amount: -100 },
        { date: '2026-01-01', amount: 200 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(1.0, 3);
  });

  it('solves a flat 1-year 10% return', () => {
    const result = calculateXirr({
      cashFlows: [
        { date: '2025-01-01', amount: -1000 },
        { date: '2026-01-01', amount: 1100 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0.1, 3);
  });

  it('handles a negative return', () => {
    const result = calculateXirr({
      cashFlows: [
        { date: '2025-01-01', amount: -1000 },
        { date: '2026-01-01', amount: 900 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(-0.1, 3);
  });

  it('solves with multiple deposits and a final value (Excel XIRR equivalent)', () => {
    // Hand-verified by NPV at r=0.225: -1000 - 1000/(1.225^(90/365)) - 1000/(1.225^(181/365)) + 3500/1.225 ≈ 0
    const result = calculateXirr({
      cashFlows: [
        { date: '2025-01-01', amount: -1000 },
        { date: '2025-04-01', amount: -1000 },
        { date: '2025-07-01', amount: -1000 },
        { date: '2026-01-01', amount: 3500 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0.225, 2);
  });

  it('handles withdrawal in the middle', () => {
    // Deposit 1000, withdraw 500 after 6mo, end with 700: positive return.
    // Hand-computed: NPV crosses zero around r ≈ 0.26.
    const result = calculateXirr({
      cashFlows: [
        { date: '2025-01-01', amount: -1000 },
        { date: '2025-07-01', amount: 500 },
        { date: '2026-01-01', amount: 700 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0.2);
    expect(result!).toBeLessThan(0.3);
  });

  it('is order-independent', () => {
    const ordered = calculateXirr({
      cashFlows: [
        { date: '2025-01-01', amount: -1000 },
        { date: '2026-01-01', amount: 1100 },
      ],
    });
    const reversed = calculateXirr({
      cashFlows: [
        { date: '2026-01-01', amount: 1100 },
        { date: '2025-01-01', amount: -1000 },
      ],
    });
    expect(ordered).toBeCloseTo(reversed!, 6);
  });

  it('handles small fractional period', () => {
    // 30-day return of 1% → annualized = (1.01)^(365/30) - 1 ≈ 0.1297
    const result = calculateXirr({
      cashFlows: [
        { date: '2025-01-01', amount: -1000 },
        { date: '2025-01-31', amount: 1010 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0.1297, 1);
  });

  it('solves with Date instances as well as ISO strings', () => {
    const result = calculateXirr({
      cashFlows: [
        { date: new Date('2025-01-01'), amount: -1000 },
        { date: new Date('2026-01-01'), amount: 1100 },
      ],
    });
    expect(result).toBeCloseTo(0.1, 3);
  });
});
