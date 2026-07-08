import { endpointsTypes } from '@bt/shared/types';
import { format, parseISO } from 'date-fns';
import { describe, expect, it } from 'vitest';

import { computePrevPeriod, computeTrendPeriods, isFullMonthPeriod, sliceCashFlowTotals } from './helpers';

const ymd = (date: Date) => format(date, 'yyyy-MM-dd');

const period = ({
  start,
  income,
  expenses,
}: {
  start: string;
  income: number;
  expenses: number;
}): endpointsTypes.CashFlowPeriodData => ({
  periodStart: start,
  periodEnd: start,
  income,
  expenses,
  netFlow: income - expenses,
});

const PERIODS: endpointsTypes.CashFlowPeriodData[] = [
  period({ start: '2026-02-01', income: 1000, expenses: 400 }),
  period({ start: '2026-03-01', income: 1200, expenses: 500 }),
  period({ start: '2026-04-01', income: 1000, expenses: 1100 }),
  period({ start: '2026-05-01', income: 1100, expenses: 300 }),
  period({ start: '2026-06-01', income: 2000, expenses: 800 }),
  period({ start: '2026-07-01', income: 1500, expenses: 600 }),
];

describe('isFullMonthPeriod', () => {
  it('is true for a whole calendar month', () => {
    expect(isFullMonthPeriod({ from: parseISO('2026-07-01'), to: parseISO('2026-07-31') })).toBe(true);
  });

  it('is true for February (short month)', () => {
    expect(isFullMonthPeriod({ from: parseISO('2026-02-01'), to: parseISO('2026-02-28') })).toBe(true);
  });

  it('is false for a partial month', () => {
    expect(isFullMonthPeriod({ from: parseISO('2026-07-01'), to: parseISO('2026-07-20') })).toBe(false);
  });

  it('is false for a range spanning two months', () => {
    expect(isFullMonthPeriod({ from: parseISO('2026-06-15'), to: parseISO('2026-07-15') })).toBe(false);
  });
});

describe('computePrevPeriod', () => {
  it('returns the previous calendar month for a full month', () => {
    const prev = computePrevPeriod({ from: parseISO('2026-07-01'), to: parseISO('2026-07-31') });
    expect(ymd(prev.from)).toBe('2026-06-01');
    expect(ymd(prev.to)).toBe('2026-06-30');
  });

  it('returns the same-length window ending the day before, for a custom range', () => {
    // Jul 10–20 is 11 days → prev is Jun 29–Jul 9.
    const prev = computePrevPeriod({ from: parseISO('2026-07-10'), to: parseISO('2026-07-20') });
    expect(ymd(prev.from)).toBe('2026-06-29');
    expect(ymd(prev.to)).toBe('2026-07-09');
  });
});

describe('computeTrendPeriods', () => {
  it('returns 5 past months + the current month for a full month', () => {
    const periods = computeTrendPeriods({ from: parseISO('2026-07-01'), to: parseISO('2026-07-31') });

    expect(periods).toHaveLength(6);
    expect(periods.map((p) => ymd(p.from))).toEqual([
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
    ]);
    expect(periods.slice(0, 5).every((p) => !p.isCurrent)).toBe(true);
    expect(periods[5]!.isCurrent).toBe(true);
  });

  it('flags only the last period as current for a custom range', () => {
    const periods = computeTrendPeriods({ from: parseISO('2026-07-10'), to: parseISO('2026-07-20') });

    expect(periods).toHaveLength(6);
    expect(periods.filter((p) => p.isCurrent)).toHaveLength(1);
    expect(periods[5]!.isCurrent).toBe(true);
    // Each window is the same 11-day length, back-to-back.
    expect(ymd(periods[5]!.from)).toBe('2026-07-10');
    expect(ymd(periods[4]!.to)).toBe('2026-07-09');
  });
});

describe('sliceCashFlowTotals', () => {
  it('slices a single month (current-period case)', () => {
    expect(sliceCashFlowTotals({ periods: PERIODS, from: parseISO('2026-07-01'), to: parseISO('2026-07-31') })).toEqual(
      { income: 1500, expenses: 600, netFlow: 900, savingsRate: 60 },
    );
  });

  it('slices the previous month independently of the current one', () => {
    expect(sliceCashFlowTotals({ periods: PERIODS, from: parseISO('2026-06-01'), to: parseISO('2026-06-30') })).toEqual(
      { income: 2000, expenses: 800, netFlow: 1200, savingsRate: 60 },
    );
  });

  it('produces a negative savings rate when expenses exceed income', () => {
    expect(sliceCashFlowTotals({ periods: PERIODS, from: parseISO('2026-04-01'), to: parseISO('2026-04-30') })).toEqual(
      { income: 1000, expenses: 1100, netFlow: -100, savingsRate: -10 },
    );
  });

  it('sums every month whose start falls inside a multi-month span', () => {
    // Feb..Jun: income 6300, expenses 3100, netFlow 3200, round(3200/6300*100) = 51
    expect(sliceCashFlowTotals({ periods: PERIODS, from: parseISO('2026-02-01'), to: parseISO('2026-06-30') })).toEqual(
      { income: 6300, expenses: 3100, netFlow: 3200, savingsRate: 51 },
    );
  });

  it('excludes buckets outside the range', () => {
    // July only — Feb..Jun buckets must not leak in.
    const july = sliceCashFlowTotals({ periods: PERIODS, from: parseISO('2026-07-01'), to: parseISO('2026-07-31') });
    expect(july.income).toBe(1500);
  });

  it('returns zeroed totals (savingsRate 0) when no bucket matches', () => {
    expect(sliceCashFlowTotals({ periods: PERIODS, from: parseISO('2026-01-01'), to: parseISO('2026-01-31') })).toEqual(
      { income: 0, expenses: 0, netFlow: 0, savingsRate: 0 },
    );
  });

  it('keeps savingsRate at 0 when income is 0 (no divide-by-zero)', () => {
    const periods = [period({ start: '2026-08-01', income: 0, expenses: 500 })];
    expect(sliceCashFlowTotals({ periods, from: parseISO('2026-08-01'), to: parseISO('2026-08-31') })).toEqual({
      income: 0,
      expenses: 500,
      netFlow: -500,
      savingsRate: 0,
    });
  });
});
