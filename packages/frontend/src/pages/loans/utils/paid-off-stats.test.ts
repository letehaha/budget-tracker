import { describe, expect, it } from 'vitest';

import { getLoanCostSplit, getLoanDurationParts, getMonthsEarly } from './paid-off-stats';

describe('getLoanDurationParts', () => {
  it('splits a whole-year span into years and zero months', () => {
    const result = getLoanDurationParts({ start: new Date(2020, 0, 1), end: new Date(2024, 0, 1) });
    expect(result).toEqual({ totalMonths: 48, years: 4, months: 0 });
  });

  it('splits a mixed span into years and months', () => {
    // 2020-03 → 2024-07 = 52 months = 4 yrs 4 mo.
    const result = getLoanDurationParts({ start: new Date(2020, 2, 10), end: new Date(2024, 6, 20) });
    expect(result).toEqual({ totalMonths: 52, years: 4, months: 4 });
  });

  it('floors a same-month span at zero', () => {
    const result = getLoanDurationParts({ start: new Date(2024, 5, 1), end: new Date(2024, 5, 28) });
    expect(result).toEqual({ totalMonths: 0, years: 0, months: 0 });
  });

  it('never returns negative months when end precedes start', () => {
    const result = getLoanDurationParts({ start: new Date(2024, 5, 1), end: new Date(2023, 5, 1) });
    expect(result).toEqual({ totalMonths: 0, years: 0, months: 0 });
  });
});

describe('getMonthsEarly', () => {
  it('reports how many months before the contractual end the loan closed', () => {
    // Start 2020-01, 60-month term → scheduled end 2025-01. Closed 2024-01 → 12 months early.
    const result = getMonthsEarly({
      startDate: new Date(2020, 0, 1),
      termMonths: 60,
      closedDate: new Date(2024, 0, 1),
    });
    expect(result).toBe(12);
  });

  it('returns 0 when the loan closed on or after schedule', () => {
    expect(getMonthsEarly({ startDate: new Date(2020, 0, 1), termMonths: 48, closedDate: new Date(2024, 0, 1) })).toBe(
      0,
    );
    expect(getMonthsEarly({ startDate: new Date(2020, 0, 1), termMonths: 48, closedDate: new Date(2025, 0, 1) })).toBe(
      0,
    );
  });

  it('returns null when the loan has no usable term', () => {
    expect(
      getMonthsEarly({ startDate: new Date(2020, 0, 1), termMonths: null, closedDate: new Date(2024, 0, 1) }),
    ).toBeNull();
    expect(
      getMonthsEarly({ startDate: new Date(2020, 0, 1), termMonths: 0, closedDate: new Date(2024, 0, 1) }),
    ).toBeNull();
  });
});

describe('getLoanCostSplit', () => {
  it('splits total cost into principal and interest shares', () => {
    const result = getLoanCostSplit({ principal: 100000, estimatedInterest: 25000 });
    expect(result.total).toBe(125000);
    expect(result.hasInterest).toBe(true);
    expect(result.principalPercent).toBeCloseTo(80, 5);
    expect(result.interestPercent).toBeCloseTo(20, 5);
    // 25,000 interest / 100,000 principal × 100 = 25¢ per $1 borrowed.
    expect(result.interestPerDollarCents).toBe(25);
  });

  it('collapses to principal-only when interest is null', () => {
    const result = getLoanCostSplit({ principal: 100000, estimatedInterest: null });
    expect(result.total).toBe(100000);
    expect(result.hasInterest).toBe(false);
    expect(result.principalPercent).toBe(100);
    expect(result.interestPercent).toBe(0);
    expect(result.interestPerDollarCents).toBeNull();
  });

  it('treats zero interest as no interest', () => {
    const result = getLoanCostSplit({ principal: 100000, estimatedInterest: 0 });
    expect(result.hasInterest).toBe(false);
    expect(result.interestPerDollarCents).toBeNull();
    expect(result.principalPercent).toBe(100);
  });

  it('rounds cents-per-dollar to the nearest cent', () => {
    // 3,333 / 100,000 × 100 = 3.333 → 3¢.
    expect(getLoanCostSplit({ principal: 100000, estimatedInterest: 3333 }).interestPerDollarCents).toBe(3);
    // 3,666 / 100,000 × 100 = 3.666 → 4¢.
    expect(getLoanCostSplit({ principal: 100000, estimatedInterest: 3666 }).interestPerDollarCents).toBe(4);
  });
});
