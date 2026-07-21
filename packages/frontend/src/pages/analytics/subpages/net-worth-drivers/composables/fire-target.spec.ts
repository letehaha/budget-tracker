import { describe, expect, it } from 'vitest';

import { type FireTargetResult, computeFireTarget } from './fire-target';

/**
 * Asserts the discriminated status and narrows the result to that variant, so a
 * test can read `gap`/`yearsToTarget` without the compiler rejecting a field the
 * base union does not carry.
 */
function assertStatus<S extends FireTargetResult['status']>(
  result: FireTargetResult,
  status: S,
): asserts result is Extract<FireTargetResult, { status: S }> {
  expect(result.status).toBe(status);
}

describe('computeFireTarget', () => {
  it('solves the needed value and gap for the worked example', () => {
    // $800/mo saved, 12%/yr (1%/mo), target 90% growth share, $187,062 held today.
    // needed = 0.9/0.1 * 800 / 0.01 = $720,000; gap = 720,000 - 187,062.
    const result = computeFireTarget({
      currentPortfolioValue: 187_062,
      monthlySavings: 800,
      annualReturnRatePct: 12,
      targetGrowthSharePct: 90,
    });

    assertStatus(result, 'projected');
    expect(result.portfolioValueNeeded).toBeCloseTo(720_000, 2);
    expect(result.gap).toBeCloseTo(532_938, 2);
  });

  it('projects a positive, finite ETA that shrinks as the gap closes', () => {
    const base = { monthlySavings: 800, annualReturnRatePct: 12, targetGrowthSharePct: 90 };

    const far = computeFireTarget({ ...base, currentPortfolioValue: 187_062 });
    const near = computeFireTarget({ ...base, currentPortfolioValue: 600_000 });

    assertStatus(far, 'projected');
    assertStatus(near, 'projected');
    expect(far.yearsToTarget).toBeGreaterThan(0);
    expect(Number.isFinite(far.yearsToTarget)).toBe(true);
    // ~9.2 years from $187k; the pinned value guards a broken future-value solve.
    expect(far.yearsToTarget).toBeCloseTo(9.19, 1);
    expect(near.yearsToTarget).toBeLessThan(far.yearsToTarget);
  });

  it('reports the target reached once the current value clears it', () => {
    const result = computeFireTarget({
      currentPortfolioValue: 800_000,
      monthlySavings: 800,
      annualReturnRatePct: 12,
      targetGrowthSharePct: 90,
    });

    assertStatus(result, 'reached');
    expect(result.portfolioValueNeeded).toBeCloseTo(720_000, 2);
    // The reached variant carries no gap or ETA at all rather than zeroed ones.
    expect(result).not.toHaveProperty('gap');
    expect(result).not.toHaveProperty('yearsToTarget');
  });

  it('is unreachable when the expected return is not positive', () => {
    const result = computeFireTarget({
      currentPortfolioValue: 200_000,
      monthlySavings: 800,
      annualReturnRatePct: 0,
      targetGrowthSharePct: 80,
    });

    assertStatus(result, 'unreachable');
    expect(result.reason).toBe('noReturn');
    // A portfolio that cannot grow contributes nothing to the monthly gain.
    expect(result.currentGrowthSharePct).toBe(0);
  });

  it('treats zero saving as already past the crossover', () => {
    // With no saving, every dollar of the month's gain is growth, so the target
    // is met at any positive value and there is nothing left to aim for.
    const result = computeFireTarget({
      currentPortfolioValue: 50_000,
      monthlySavings: 0,
      annualReturnRatePct: 10,
      targetGrowthSharePct: 80,
    });

    assertStatus(result, 'reached');
    expect(result.portfolioValueNeeded).toBe(0);
    expect(result.currentGrowthSharePct).toBe(100);
  });

  it('clamps a target of 100% (or more) below the singularity so the needed value stays finite', () => {
    // needed = target/(1-target) * savings/return diverges as the target reaches 100%.
    // The 99% ceiling caps it at 0.99/0.01 * 800/0.01 = $7,920,000 instead of Infinity.
    const atHundred = computeFireTarget({
      currentPortfolioValue: 100_000,
      monthlySavings: 800,
      annualReturnRatePct: 12,
      targetGrowthSharePct: 100,
    });

    assertStatus(atHundred, 'projected');
    expect(Number.isFinite(atHundred.portfolioValueNeeded)).toBe(true);
    expect(atHundred.portfolioValueNeeded).toBeCloseTo(7_920_000, 2);
    expect(Number.isFinite(atHundred.yearsToTarget)).toBe(true);

    // A share above 100% clamps to the same ceiling rather than overshooting it.
    const aboveHundred = computeFireTarget({
      currentPortfolioValue: 100_000,
      monthlySavings: 800,
      annualReturnRatePct: 12,
      targetGrowthSharePct: 150,
    });
    assertStatus(aboveHundred, 'projected');
    expect(aboveHundred.portfolioValueNeeded).toBeCloseTo(7_920_000, 2);
  });

  it('assigns a full growth share when a net drawdown outweighs growth', () => {
    // Growth now = 100,000 * 0.01 = 1,000/mo, but 2,000/mo is being withdrawn, so the
    // month's net gain is negative while growth itself is still the only lift.
    const result = computeFireTarget({
      currentPortfolioValue: 100_000,
      monthlySavings: -2_000,
      annualReturnRatePct: 12,
      targetGrowthSharePct: 90,
    });

    expect(result.currentGrowthSharePct).toBe(100);
  });

  it('treats strictly negative saving like zero: reached with no value left to aim for', () => {
    // Negative saving hits the same short-circuit as zero saving — every dollar of
    // lift is growth, so the target is met at any positive value.
    const result = computeFireTarget({
      currentPortfolioValue: 100_000,
      monthlySavings: -2_000,
      annualReturnRatePct: 12,
      targetGrowthSharePct: 90,
    });

    assertStatus(result, 'reached');
    expect(result.portfolioValueNeeded).toBe(0);
  });

  it('measures the current growth share at today value', () => {
    // Growth now = 120,000 * 0.01 = 1,200/mo against 800 saved -> 1200/2000 = 60%.
    const result = computeFireTarget({
      currentPortfolioValue: 120_000,
      monthlySavings: 800,
      annualReturnRatePct: 12,
      targetGrowthSharePct: 90,
    });

    expect(result.currentGrowthSharePct).toBeCloseTo(60, 5);
  });
});
