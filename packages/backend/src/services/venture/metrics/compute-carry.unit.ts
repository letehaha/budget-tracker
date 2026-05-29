import { describe, expect, it } from '@jest/globals';

import { computeCarry } from './compute-carry';

describe('computeCarry — European waterfall', () => {
  const baseInput = {
    costBasis: '17360',
    carryPct: '0.2',
    hurdlePct: '0',
    yearsHeld: 1,
  };

  it('first distribution that does not exceed principal → carry=0 (all principal return)', () => {
    const result = computeCarry({
      ...baseInput,
      grossAmount: '5000',
      cumulativeLpPrincipalReturned: '0',
    });
    expect(Number(result.gpCarryAmount)).toBe(0);
    expect(Number(result.lpNetAmount)).toBe(5000);
    expect(Number(result.principalReturnedThisEvent)).toBe(5000);
    expect(Number(result.profitThisEvent)).toBe(0);
  });

  it('distribution mixing principal + profit → carry only on profit portion', () => {
    // principalRemaining = 17360 - 12360 = 5000
    // gross = 8000 → principal return 5000, profit 3000, carry 0.2*3000 = 600
    const result = computeCarry({
      ...baseInput,
      grossAmount: '8000',
      cumulativeLpPrincipalReturned: '12360',
    });
    expect(Number(result.principalReturnedThisEvent)).toBe(5000);
    expect(Number(result.profitThisEvent)).toBe(3000);
    expect(Number(result.gpCarryAmount)).toBeCloseTo(600, 2);
    expect(Number(result.lpNetAmount)).toBeCloseTo(7400, 2);
  });

  it('distribution after full principal returned → carry on full gross', () => {
    const result = computeCarry({
      ...baseInput,
      grossAmount: '10000',
      cumulativeLpPrincipalReturned: '17360',
    });
    expect(Number(result.principalReturnedThisEvent)).toBe(0);
    expect(Number(result.profitThisEvent)).toBe(10000);
    expect(Number(result.gpCarryAmount)).toBeCloseTo(2000, 2);
    expect(Number(result.lpNetAmount)).toBeCloseTo(8000, 2);
  });

  it('SK 116 final-exit case', () => {
    // gross=$25,000, costBasis=17360, cumulativeReturned=$5,000 (Year 1 dist)
    // principalRemaining=$12,360 → principal return $12,360, profit $12,640
    // carry = 0.2 * 12640 = 2528, lp = 22472
    const result = computeCarry({
      ...baseInput,
      grossAmount: '25000',
      cumulativeLpPrincipalReturned: '5000',
    });
    expect(Number(result.principalReturnedThisEvent)).toBeCloseTo(12360, 2);
    expect(Number(result.profitThisEvent)).toBeCloseTo(12640, 2);
    expect(Number(result.gpCarryAmount)).toBeCloseTo(2528, 2);
    expect(Number(result.lpNetAmount)).toBeCloseTo(22472, 2);
  });

  it('hurdle credit reduces carry when hurdle > 0', () => {
    // gross=10k all profit, carry rate 0.2 → carry before hurdle = 2000
    // principalRemaining = 17360, hurdle 8%, yearsHeld=1 → hurdleCredit = 17360 * 0.08 * 1 = 1388.8
    // gpCarry = max(0, 2000 - 1388.8) = 611.2
    // principal=10000, none returned yet, gross=15000, hurdle 8%, yearsHeld=1
    // principalRemaining(before) = 10000
    // principalReturnedThisEvent = min(15000, 10000) = 10000
    // profitThisEvent = 5000
    // carryBeforeHurdle = 5000 * 0.2 = 1000
    // hurdleCredit = 10000 * 0.08 * 1 = 800
    // gpCarry = max(1000 - 800, 0) = 200
    // lpNet = 15000 - 200 = 14800
    const result = computeCarry({
      grossAmount: '15000',
      costBasis: '10000',
      cumulativeLpPrincipalReturned: '0',
      carryPct: '0.2',
      hurdlePct: '0.08',
      yearsHeld: 1,
    });
    expect(Number(result.hurdleCredit)).toBeCloseTo(800, 2);
    expect(Number(result.gpCarryAmount)).toBeCloseTo(200, 2);
    expect(Number(result.lpNetAmount)).toBeCloseTo(14800, 2);
  });

  it('hurdle credit fully absorbs carry → gpCarry=0', () => {
    // principal=10000, gross=12000, hurdle 8%, yearsHeld=5
    // principalReturnedThisEvent=10000, profit=2000, carryBeforeHurdle=400
    // hurdleCredit = 10000 * 0.08 * 5 = 4000 → gpCarry = max(400 - 4000, 0) = 0
    const result = computeCarry({
      grossAmount: '12000',
      costBasis: '10000',
      cumulativeLpPrincipalReturned: '0',
      carryPct: '0.2',
      hurdlePct: '0.08',
      yearsHeld: 5,
    });
    expect(Number(result.gpCarryAmount)).toBe(0);
    expect(Number(result.lpNetAmount)).toBe(12000);
  });

  it('once principal fully returned, hurdle credit is zero (GP gets full carry)', () => {
    // Standard European waterfall: hurdle protects LP during principal-recovery window.
    // After full return, GP earns full carry on profit.
    const result = computeCarry({
      grossAmount: '10000',
      costBasis: '10000',
      cumulativeLpPrincipalReturned: '10000',
      carryPct: '0.2',
      hurdlePct: '0.08',
      yearsHeld: 5,
    });
    expect(Number(result.hurdleCredit)).toBe(0);
    expect(Number(result.gpCarryAmount)).toBeCloseTo(2000, 2);
    expect(Number(result.lpNetAmount)).toBeCloseTo(8000, 2);
  });

  it('gross=0 → all-zero result', () => {
    const result = computeCarry({
      ...baseInput,
      grossAmount: '0',
      cumulativeLpPrincipalReturned: '0',
    });
    expect(Number(result.gpCarryAmount)).toBe(0);
    expect(Number(result.lpNetAmount)).toBe(0);
    expect(Number(result.profitThisEvent)).toBe(0);
  });

  it('carryPct=0 → LP keeps full gross even with profit', () => {
    const result = computeCarry({
      ...baseInput,
      grossAmount: '10000',
      cumulativeLpPrincipalReturned: '17360',
      carryPct: '0',
    });
    expect(Number(result.gpCarryAmount)).toBe(0);
    expect(Number(result.lpNetAmount)).toBe(10000);
  });

  it('negative cumulativePrincipalReturned (shouldn’t happen but should not crash)', () => {
    const result = computeCarry({
      ...baseInput,
      grossAmount: '5000',
      cumulativeLpPrincipalReturned: '-100',
    });
    // Should not blow up; principalRemainingBefore = max(17360 - (-100), 0) = 17460
    expect(Number(result.principalReturnedThisEvent)).toBe(5000);
    expect(Number(result.profitThisEvent)).toBe(0);
    expect(Number(result.gpCarryAmount)).toBe(0);
  });

  it('cumulativeReturned > costBasis (overshoot) → all profit', () => {
    // principalRemaining = max(17360 - 20000, 0) = 0, gross all profit, carry 0.2*5000=1000
    const result = computeCarry({
      ...baseInput,
      grossAmount: '5000',
      cumulativeLpPrincipalReturned: '20000',
    });
    expect(Number(result.principalReturnedThisEvent)).toBe(0);
    expect(Number(result.profitThisEvent)).toBe(5000);
    expect(Number(result.gpCarryAmount)).toBeCloseTo(1000, 2);
  });
});
