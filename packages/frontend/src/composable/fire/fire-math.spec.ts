import { describe, expect, it } from 'vitest';

import {
  HORIZON_MONTHS,
  ageAt,
  coastNumber,
  fireNumber,
  isReached,
  monthlyIncomeFrom,
  monthsToLabel,
  progressRatio,
  requiredMonthlyContribution,
  savingsRatePct,
  simulate,
  toRealAnnual,
  typeTargets,
  yearsOfSpendingCovered,
} from './fire-math';

const run = ({
  assets,
  liabilities = 0,
  monthlyContribution,
  realAnnual,
  target,
  coastMonths = null,
}: {
  assets: number;
  liabilities?: number;
  monthlyContribution: number;
  realAnnual: number;
  target: number;
  coastMonths?: number | null;
}) =>
  simulate({
    assets,
    liabilities,
    monthlyContribution,
    realAnnual,
    thresholds: [target + liabilities],
    coastMonths,
    coastThresholdIndex: 0,
  });

describe('fire-math golden fixtures', () => {
  it('FIRE number 40,000 @ 4% = 1,000,000', () => {
    expect(fireNumber({ annualSpending: 40_000, withdrawalRatePct: 4 })).toBeCloseTo(1_000_000, 6);
  });

  it('screenshot case: targets and 217 months', () => {
    const targets = typeTargets({
      annualSpending: 35_714.28,
      withdrawalRatePct: 4,
      leanMultiplier: 0.6,
      fatMultiplier: 1.5,
      baristaMonthlyIncome: null,
    });
    expect(targets.regular).toBeCloseTo(892_857, 0);
    expect(targets.lean).toBeCloseTo(535_714, 0);
    expect(targets.fat).toBeCloseTo(1_339_286, -1);
    expect(targets.barista).toBeNull();
    expect(
      run({
        assets: 371_000,
        monthlyContribution: 0,
        realAnnual: 0.05,
        target: targets.regular,
      }).hitMonth,
    ).toEqual([217]);
  });

  it('barista target subtracts part-time income', () => {
    const { barista } = typeTargets({
      annualSpending: 40_000,
      withdrawalRatePct: 4,
      leanMultiplier: 0.7,
      fatMultiplier: 1.5,
      baristaMonthlyIncome: 1_000,
    });
    expect(barista).toBeCloseTo(700_000, 6);
  });

  it('MMM 50% savings rate -> 197 months', () => {
    expect(
      run({
        assets: 0,
        monthlyContribution: 25_000 / 12,
        realAnnual: 0.05,
        target: 625_000,
      }).hitMonth,
    ).toEqual([197]);
  });

  it('Coast 1,250,000 @ 7% real over 28y ~ 187,960', () => {
    expect(coastNumber({ target: 1_250_000, realAnnual: 0.07, yearsToCoastAge: 28 })).toBeCloseTo(187_960, -2);
    expect(coastNumber({ target: 1_250_000, realAnnual: 0.07, yearsToCoastAge: 0 })).toBe(1_250_000);
  });

  it('Fisher 8% nominal / 3% inflation = 4.854% real', () => {
    expect(toRealAnnual({ nominalPct: 8, inflationPct: 3 })).toBeCloseTo(0.04854, 5);
  });

  it('c = 0: FIRE month equals the coast horizon', () => {
    const base = {
      assets: 371_000,
      monthlyContribution: 0,
      realAnnual: 0.05,
      target: 892_857,
    };
    const fireMonth = run(base).hitMonth[0]!;
    expect(run({ ...base, coastMonths: fireMonth }).coastHitMonth).toBe(0);
    expect(run({ ...base, coastMonths: fireMonth - 1 }).coastHitMonth).toBe(fireMonth);
  });

  it('horizon cap: 100k, +1k/mo, -1% real, 1M -> null', () => {
    const result = run({
      assets: 100_000,
      monthlyContribution: 1_000,
      realAnnual: -0.01,
      target: 1_000_000,
    });
    expect(result.hitMonth).toEqual([null]);
    expect(result.series).toHaveLength(HORIZON_MONTHS + 1);
  });

  it('already FI -> 0', () => {
    expect(
      run({
        assets: 1_200_000,
        monthlyContribution: 0,
        realAnnual: 0.05,
        target: 1_000_000,
      }).hitMonth,
    ).toEqual([0]);
  });

  it('truly unreachable (0, 0) -> null and stops at month 0', () => {
    const result = run({
      assets: 0,
      monthlyContribution: 0,
      realAnnual: 0.05,
      target: 1_000_000,
    });
    expect(result.hitMonth).toEqual([null]);
    expect(result.series).toEqual([0]);
  });

  it('Coast moving threshold: 100k, +1k/mo, 5% real, 30y, 1M -> 189 not 80', () => {
    const result = run({
      assets: 100_000,
      monthlyContribution: 1_000,
      realAnnual: 0.05,
      target: 1_000_000,
      coastMonths: 360,
    });
    expect(result.coastHitMonth).toBe(189);
  });

  it('loans shift thresholds: assets 200k, loans 300k, +3k/mo, 8%/3% -> 194', () => {
    const result = run({
      assets: 200_000,
      liabilities: 300_000,
      monthlyContribution: 3_000,
      realAnnual: toRealAnnual({ nominalPct: 8, inflationPct: 3 }),
      target: 1_000_000,
    });
    expect(result.hitMonth).toEqual([194]);
    expect(result.series[0]).toBe(-100_000);
    expect(result.series).toHaveLength(HORIZON_MONTHS + 1);
  });

  it('loans exceed assets with c = 0: assets still compound to 461', () => {
    const result = run({
      assets: 200_000,
      liabilities: 300_000,
      monthlyContribution: 0,
      realAnnual: 0.05,
      target: 1_000_000,
    });
    expect(result.series).toHaveLength(HORIZON_MONTHS + 1);
    expect(result.hitMonth).toEqual([461]);
  });

  it('PMT at i = 0 -> 3,750; already there -> 0', () => {
    expect(
      requiredMonthlyContribution({
        balance: 100_000,
        target: 1_000_000,
        realAnnual: 0,
        months: 240,
      }),
    ).toBeCloseTo(3_750, 6);
    expect(
      requiredMonthlyContribution({
        balance: 900_000,
        target: 1_000_000,
        realAnnual: 0.05,
        months: 240,
      }),
    ).toBe(0);
  });

  it('PMT reaches the target when fed back into simulate', () => {
    const c = requiredMonthlyContribution({
      balance: 50_000,
      target: 1_000_000,
      realAnnual: 0.05,
      months: 240,
    });
    const result = run({
      assets: 50_000,
      monthlyContribution: c,
      realAnnual: 0.05,
      target: 1_000_000,
    });
    expect(result.series[240]).toBeCloseTo(1_000_000, 2);
  });

  it('cuts the series when net goes non-positive while withdrawing', () => {
    const result = run({
      assets: 10_000,
      monthlyContribution: -1_000,
      realAnnual: 0,
      target: 1_000_000,
    });
    expect(result.series).toHaveLength(11);
  });
});

describe('fire-math helpers', () => {
  it('progressRatio', () => {
    expect(progressRatio({ balance: 250, target: 1_000 })).toBe(0.25);
    expect(progressRatio({ balance: -5, target: 1_000 })).toBe(0);
    expect(progressRatio({ balance: 2_000, target: 1_000 })).toBe(2);
    expect(progressRatio({ balance: 0, target: 0 })).toBe(1);
    expect(progressRatio({ balance: -5, target: 0 })).toBe(0);
  });

  it('yearsOfSpendingCovered', () => {
    expect(yearsOfSpendingCovered({ balance: 100_000, annualSpending: 40_000 })).toBe(2.5);
    expect(yearsOfSpendingCovered({ balance: 100_000, annualSpending: 0 })).toBeNull();
    expect(yearsOfSpendingCovered({ balance: 100_000, annualSpending: -1 })).toBeNull();
  });

  it('monthlyIncomeFrom', () => {
    expect(monthlyIncomeFrom({ balance: 1_200_000, withdrawalRatePct: 4 })).toBe(4_000);
    expect(monthlyIncomeFrom({ balance: -50_000, withdrawalRatePct: 4 })).toBe(0);
  });

  it('isReached', () => {
    expect(isReached({ balance: 1_000, target: 1_000 })).toBe(true);
    expect(isReached({ balance: 999, target: 1_000 })).toBe(false);
    expect(isReached({ balance: 0, target: 0 })).toBe(true);
    expect(isReached({ balance: -1, target: 0 })).toBe(false);
  });

  it('savingsRatePct', () => {
    expect(savingsRatePct({ income: 1_000, expenses: 600 })).toBeCloseTo(40, 10);
    expect(savingsRatePct({ income: 0, expenses: 600 })).toBeNull();
  });

  it('monthsToLabel', () => {
    expect(monthsToLabel({ months: 127 })).toEqual({ years: 10, months: 7 });
  });
});

describe('fire-math properties', () => {
  const contributions = [0, 500, 1_000, 2_000, 5_000];
  const rates = [-0.02, 0, 0.02, 0.05, 0.08];
  const balances = [0, 50_000, 300_000];

  it('hitMonth is non-increasing in contribution and return', () => {
    for (const assets of balances) {
      for (const realAnnual of rates) {
        let prev = Infinity;
        for (const monthlyContribution of contributions) {
          const hit = run({ assets, monthlyContribution, realAnnual, target: 1_000_000 }).hitMonth[0] ?? Infinity;
          expect(hit).toBeLessThanOrEqual(prev);
          prev = hit;
        }
      }
      for (const monthlyContribution of contributions) {
        let prev = Infinity;
        for (const realAnnual of rates) {
          const hit = run({ assets, monthlyContribution, realAnnual, target: 1_000_000 }).hitMonth[0] ?? Infinity;
          expect(hit).toBeLessThanOrEqual(prev);
          prev = hit;
        }
      }
    }
  });

  it('+/-2 point branches bracket the base run', () => {
    for (const assets of balances) {
      for (const monthlyContribution of contributions) {
        for (const realAnnual of rates) {
          const at = (r: number) =>
            run({
              assets,
              monthlyContribution,
              realAnnual: r,
              target: 1_000_000,
            }).hitMonth[0] ?? Infinity;
          expect(at(realAnnual + 0.02)).toBeLessThanOrEqual(at(realAnnual));
          expect(at(realAnnual - 0.02)).toBeGreaterThanOrEqual(at(realAnnual));
        }
      }
    }
  });

  it('coastHitMonth <= regular hitMonth for positive real returns', () => {
    for (const assets of balances) {
      for (const monthlyContribution of contributions) {
        for (const realAnnual of rates.filter((r) => r > 0)) {
          for (const coastMonths of [0, 120, 360]) {
            const result = run({
              assets,
              monthlyContribution,
              realAnnual,
              target: 1_000_000,
              coastMonths,
            });
            if (result.hitMonth[0] === null) continue;
            expect(result.coastHitMonth).not.toBeNull();
            expect(result.coastHitMonth!).toBeLessThanOrEqual(result.hitMonth[0]!);
          }
        }
      }
    }
  });

  it('ageAt steps one month across Dec 31 -> Jan 1', () => {
    const dec = ageAt({ birthYear: 1990, date: new Date(2025, 11, 31) });
    const jan = ageAt({ birthYear: 1990, date: new Date(2026, 0, 1) });
    expect(jan - dec).toBeCloseTo(1 / 12, 10);
    const nov = ageAt({ birthYear: 1990, date: new Date(2025, 10, 30) });
    expect(dec - nov).toBeCloseTo(1 / 12, 10);
    expect(ageAt({ birthYear: 1990, date: new Date(2026, 8, 24) })).toBeCloseTo(2026 + 8.5 / 12 - 1990.5, 6);
  });
});
