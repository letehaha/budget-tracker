import { addMonths } from 'date-fns';
import { describe, expect, it } from 'vitest';

import {
  SAME_INTEREST_EPSILON,
  comparePayoffScenarios,
  computeMinimumPaymentFromTerm,
  computePayoffScenario,
  roundHalfToEven,
} from './payoff-schedule';

describe('roundHalfToEven', () => {
  it('rounds non-half values to the nearest integer', () => {
    expect(roundHalfToEven(2.4)).toBe(2);
    expect(roundHalfToEven(2.6)).toBe(3);
    expect(roundHalfToEven(0.49)).toBe(0);
  });

  it('rounds exact halves to the even neighbour', () => {
    expect(roundHalfToEven(0.5)).toBe(0);
    expect(roundHalfToEven(1.5)).toBe(2);
    expect(roundHalfToEven(2.5)).toBe(2);
    expect(roundHalfToEven(3.5)).toBe(4);
  });
});

describe('computeMinimumPaymentFromTerm', () => {
  it('derives the level payment that amortizes the principal over the term', () => {
    // 800,000 @ 6.5% over 360 months → 5,056.54/mo (standard mortgage formula).
    const payment = computeMinimumPaymentFromTerm({ principal: 800000, interestRate: 6.5, termMonths: 360 });
    expect(payment).toBeCloseTo(5056.54, 2);
  });

  it('splits principal evenly when the APR is zero', () => {
    expect(computeMinimumPaymentFromTerm({ principal: 12000, interestRate: 0, termMonths: 24 })).toBe(500);
  });

  it('returns null when there is no usable term', () => {
    expect(computeMinimumPaymentFromTerm({ principal: 800000, interestRate: 6.5, termMonths: null })).toBeNull();
    expect(computeMinimumPaymentFromTerm({ principal: 800000, interestRate: 6.5, termMonths: 0 })).toBeNull();
  });
});

describe('computePayoffScenario', () => {
  const today = new Date(2026, 5, 15); // 2026-06-15, fixed clock

  it("matches the backend's closed-form figures for a standard mortgage", () => {
    // Mirrors the Projection card: 500,000 balance @ 6.5% paying 7,000/mo.
    const result = computePayoffScenario({ balance: 500000, interestRate: 6.5, payment: 7000, today });

    expect(result.paysOff).toBe(true);
    expect(result.monthsRemaining).toBe(91);
    // payment * months - balance = 7000 * 91 - 500000 = 137,000
    expect(result.totalInterest).toBeCloseTo(137000, 2);
    expect(result.payoffDate).toEqual(addMonths(today, 91));
  });

  it('produces a monotonically declining series that ends exactly at zero', () => {
    const result = computePayoffScenario({ balance: 500000, interestRate: 6.5, payment: 7000, today });

    // month 0 (today) .. month `monthsRemaining`
    expect(result.points).toHaveLength(92);
    expect(result.points[0]).toMatchObject({ month: 0, balance: 500000 });
    expect(result.points.at(-1)).toMatchObject({ month: 91, balance: 0 });

    for (let i = 1; i < result.points.length; i += 1) {
      expect(result.points[i]!.balance).toBeLessThanOrEqual(result.points[i - 1]!.balance);
    }
  });

  it('reports never-pays-off when the payment cannot cover monthly interest', () => {
    // Monthly interest on 500,000 @ 6.5% ≈ 2,708; paying 1,000 never reduces principal.
    const result = computePayoffScenario({ balance: 500000, interestRate: 6.5, payment: 1000, today });

    expect(result.paysOff).toBe(false);
    expect(result.monthsRemaining).toBeNull();
    expect(result.payoffDate).toBeNull();
    expect(result.totalInterest).toBeNull();
  });

  it('amortizes a zero-interest loan with no interest cost', () => {
    const result = computePayoffScenario({ balance: 12000, interestRate: 0, payment: 1000, today });

    expect(result.paysOff).toBe(true);
    expect(result.monthsRemaining).toBe(12);
    expect(result.totalInterest).toBe(0);
    expect(result.points.at(-1)).toMatchObject({ month: 12, balance: 0 });
  });

  it('treats an already-paid-off balance as complete', () => {
    const result = computePayoffScenario({ balance: 0, interestRate: 6.5, payment: 7000, today });

    expect(result.paysOff).toBe(true);
    expect(result.monthsRemaining).toBe(0);
    expect(result.totalInterest).toBe(0);
  });
});

describe('comparePayoffScenarios', () => {
  // Fixed clock matching the rest of the suite.
  const today = new Date(2026, 5, 15);
  // Shared loan parameters: 500,000 @ 6.5%.
  const balance = 500000;
  const interestRate = 6.5;

  // Baseline: the planned payment (7,000/mo → 91 months, ~137,000 interest).
  const baseline = computePayoffScenario({ balance, interestRate, payment: 7000, today });

  it('scenario paying MORE saves interest and finishes faster', () => {
    // 9,000/mo pays off sooner with less total interest than 7,000/mo.
    const scenario = computePayoffScenario({ balance, interestRate, payment: 9000, today });
    const result = comparePayoffScenarios({ scenario, baseline });

    expect(result.interestDelta).toBeLessThan(0);
    expect(result.monthsDelta).toBeLessThan(0);
    expect(result.savesInterest).toBe(true);
    expect(result.costsInterest).toBe(false);
    expect(result.faster).toBe(true);
    expect(result.slower).toBe(false);
    expect(result.sameInterest).toBe(false);
    expect(result.sameTime).toBe(false);
  });

  it('scenario paying LESS costs more interest and finishes slower', () => {
    // 5,500/mo barely covers interest — takes much longer, accumulates more interest.
    const scenario = computePayoffScenario({ balance, interestRate, payment: 5500, today });
    const result = comparePayoffScenarios({ scenario, baseline });

    expect(result.interestDelta).toBeGreaterThan(0);
    expect(result.monthsDelta).toBeGreaterThan(0);
    expect(result.costsInterest).toBe(true);
    expect(result.savesInterest).toBe(false);
    expect(result.slower).toBe(true);
    expect(result.faster).toBe(false);
    expect(result.sameInterest).toBe(false);
    expect(result.sameTime).toBe(false);
  });

  it('identical payments produce zero deltas and sameInterest + sameTime', () => {
    // Comparing baseline to itself — deltas must be exactly 0.
    const result = comparePayoffScenarios({ scenario: baseline, baseline });

    expect(result.interestDelta).toBe(0);
    expect(result.monthsDelta).toBe(0);
    expect(result.sameInterest).toBe(true);
    expect(result.sameTime).toBe(true);
    expect(result.savesInterest).toBe(false);
    expect(result.costsInterest).toBe(false);
    expect(result.faster).toBe(false);
    expect(result.slower).toBe(false);
  });

  it('sub-cent interest difference registers as sameInterest via SAME_INTEREST_EPSILON', () => {
    // Construct two synthetic scenario objects whose totalInterest differs by less
    // than SAME_INTEREST_EPSILON (0.005) — e.g. 137000.001 vs 137000.000.
    const syntheticBaseline: import('./payoff-schedule').PayoffScenario = {
      paysOff: true,
      monthsRemaining: 91,
      payoffDate: baseline.payoffDate,
      totalInterest: 137000.0,
      points: [],
    };
    const syntheticScenario: import('./payoff-schedule').PayoffScenario = {
      paysOff: true,
      monthsRemaining: 91,
      payoffDate: baseline.payoffDate,
      totalInterest: 137000.001,
      points: [],
    };

    const result = comparePayoffScenarios({ scenario: syntheticScenario, baseline: syntheticBaseline });

    // Delta is 0.001, which is < SAME_INTEREST_EPSILON (0.005).
    expect(Math.abs(result.interestDelta)).toBeLessThan(SAME_INTEREST_EPSILON);
    expect(result.sameInterest).toBe(true);
    expect(result.costsInterest).toBe(false);
    expect(result.savesInterest).toBe(false);
  });
});
