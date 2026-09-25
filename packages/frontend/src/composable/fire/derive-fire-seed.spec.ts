import { describe, expect, it } from 'vitest';

import { deriveFireSeed, getFireSeedPeriods } from './derive-fire-seed';

const NOW = new Date(2026, 8, 24);
const WINDOW_MONTHS = [
  '2025-09',
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
];

const period = ({ month, income, expenses }: { month: string; income: number; expenses: number }) => ({
  periodStart: `${month}-01`,
  income,
  expenses,
  netFlow: income - expenses,
});

const fullYear = ({ income, expenses }: { income: number; expenses: number }) =>
  WINDOW_MONTHS.map((month) => period({ month, income, expenses }));

const derive = ({
  periods,
  excludedCategoryExpenseByPeriod = {},
  ventureContributions = [],
  now = NOW,
}: Partial<Parameters<typeof deriveFireSeed>[0]> & Pick<Parameters<typeof deriveFireSeed>[0], 'periods'>) =>
  deriveFireSeed({
    periods,
    excludedCategoryExpenseByPeriod,
    ventureContributions,
    now,
  });

describe('deriveFireSeed', () => {
  it('uses the 4 months with data', () => {
    const periods = WINDOW_MONTHS.slice(-4).map((month) => period({ month, income: 4_000, expenses: 3_000 }));
    expect(derive({ periods })).toEqual({
      spending: 36_000,
      contribution: 1_000,
      contributionWasNegative: false,
      savingsRate: 25,
      monthsUsed: 4,
      typicalMonth: 3_000,
    });
  });

  it('on the first of the month the window is still the last 12 full months', () => {
    const periods = [
      period({ month: '2025-08', income: 99_000, expenses: 0 }),
      ...fullYear({ income: 5_000, expenses: 3_000 }),
      period({ month: '2026-09', income: 0, expenses: 50_000 }),
    ];
    const seed = derive({ periods, now: new Date(2026, 8, 1) });
    expect(seed.monthsUsed).toBe(12);
    expect(seed.spending).toBeCloseTo(36_000, 6);
    expect(seed.contribution).toBeCloseTo(2_000, 6);
  });

  it('no data -> manual spending required', () => {
    expect(derive({ periods: [] })).toEqual({
      spending: null,
      contribution: 0,
      contributionWasNegative: false,
      savingsRate: null,
      monthsUsed: 0,
      typicalMonth: null,
    });
  });

  it('under 3 months -> spending null', () => {
    const periods = WINDOW_MONTHS.slice(-2).map((month) => period({ month, income: 4_000, expenses: 3_000 }));
    expect(derive({ periods })).toMatchObject({
      spending: null,
      contribution: 0,
      monthsUsed: 2,
    });
  });

  it('exactly 3 months -> auto spending', () => {
    const periods = WINDOW_MONTHS.slice(-3).map((month) => period({ month, income: 4_000, expenses: 3_000 }));
    expect(derive({ periods })).toMatchObject({ spending: 36_000, monthsUsed: 3 });
  });

  it('zero expenses -> spending null, contribution still derived', () => {
    const seed = derive({ periods: fullYear({ income: 5_000, expenses: 0 }) });
    expect(seed.spending).toBeNull();
    expect(seed.contribution).toBeCloseTo(5_000, 6);
  });

  it('annual-bill household -> 30,500', () => {
    const periods = fullYear({ income: 4_000, expenses: 2_000 });
    periods[3] = period({
      month: WINDOW_MONTHS[3]!,
      income: 4_000,
      expenses: 8_500,
    });
    const seed = derive({ periods });
    expect(seed.spending).toBeCloseTo(30_500, 6);
    expect(seed.typicalMonth).toBe(2_000);
  });

  it('30k spike month keeps contribution positive and consistent with spending', () => {
    const periods = fullYear({ income: 5_000, expenses: 2_000 });
    periods[5] = period({
      month: WINDOW_MONTHS[5]!,
      income: 5_000,
      expenses: 32_000,
    });
    const seed = derive({ periods });
    expect(seed.contribution).toBeCloseTo(500, 6);
    expect(seed.spending! / 12 + seed.contribution).toBeCloseTo(5_000, 6);
    expect(seed.contributionWasNegative).toBe(false);
  });

  it('negative net flow is clamped to 0 and flagged', () => {
    const seed = derive({
      periods: fullYear({ income: 2_000, expenses: 2_500 }),
    });
    expect(seed.contribution).toBe(0);
    expect(seed.contributionWasNegative).toBe(true);
    expect(seed.savingsRate).toBeCloseTo(-25, 6);
  });

  it('subtracts venture contributions from the contribution only', () => {
    const seed = derive({
      periods: fullYear({ income: 5_000, expenses: 3_000 }),
      ventureContributions: [
        { dealId: 'a', name: 'A', amount: 6_000 },
        { dealId: 'b', name: 'B', amount: 6_000 },
      ],
    });
    expect(seed.contribution).toBeCloseTo(1_000, 6);
    expect(seed.spending).toBeCloseTo(36_000, 6);
    expect(seed.savingsRate).toBeCloseTo(40, 6);
  });

  it('subtracts excluded-category expenses from spending only', () => {
    const periods = fullYear({ income: 5_000, expenses: 3_000 });
    const seed = derive({
      periods,
      excludedCategoryExpenseByPeriod: { [periods[0]!.periodStart]: 1_200 },
    });
    expect(seed.spending).toBeCloseTo(34_800, 6);
    expect(seed.contribution).toBeCloseTo(2_000, 6);
  });

  it('typical month ignores excluded-category expenses', () => {
    const periods = fullYear({ income: 5_000, expenses: 3_000 });
    const excludedCategoryExpenseByPeriod = Object.fromEntries(periods.map((p) => [p.periodStart, 1_000]));
    expect(derive({ periods, excludedCategoryExpenseByPeriod }).typicalMonth).toBe(2_000);
  });

  it('trims leading empty months', () => {
    const periods = WINDOW_MONTHS.map((month, idx) =>
      idx < 8 ? period({ month, income: 0, expenses: 0 }) : period({ month, income: 3_000, expenses: 1_000 }),
    );
    periods[10] = period({ month: WINDOW_MONTHS[10]!, income: 0, expenses: 0 });
    const seed = derive({ periods });
    expect(seed.monthsUsed).toBe(4);
    expect(seed.spending).toBeCloseTo(9_000, 6);
  });
});

describe('getFireSeedPeriods', () => {
  it('starts at the first month with cash flow, so the venture query covers the same months', () => {
    const periods = WINDOW_MONTHS.map((month, idx) =>
      period({ month, income: idx < 8 ? 0 : 3_000, expenses: idx < 8 ? 0 : 1_000 }),
    );
    expect(getFireSeedPeriods({ periods, now: NOW }).map((p) => p.periodStart)).toEqual(
      WINDOW_MONTHS.slice(8).map((month) => `${month}-01`),
    );
  });
});
