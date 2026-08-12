import { TRANSACTION_TYPES } from '@bt/shared/types';
import { startOfDay } from 'date-fns';
import { describe, expect, it } from 'vitest';

import { type ProjectionPlanInput, buildBalanceProjection } from './balance-trend-projection';

// Local-time constructors keep the day boundaries stable in every timezone.
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).toISOString();

const NOW = new Date(2026, 7, 12, 10).getTime();
const PERIOD_END = day(2026, 8, 31);
const LAST_REAL = { date: day(2026, 8, 12), value: 7400 };

const income = (time: string, refAmount: number, note?: string): ProjectionPlanInput => ({
  time,
  refAmount,
  transactionType: TRANSACTION_TYPES.income,
  note,
});
const expense = (time: string, refAmount: number, note?: string): ProjectionPlanInput => ({
  time,
  refAmount,
  transactionType: TRANSACTION_TYPES.expense,
  note,
});

describe('buildBalanceProjection', () => {
  it('returns null without a real anchor point or without plans', () => {
    expect(
      buildBalanceProjection({
        lastRealPoint: null,
        plans: [income(at(2026, 8, 15), 100)],
        periodEnd: PERIOD_END,
        now: NOW,
      }),
    ).toBeNull();
    expect(buildBalanceProjection({ lastRealPoint: LAST_REAL, plans: [], periodEnd: PERIOD_END, now: NOW })).toBeNull();
  });

  it('returns null when the whole period is already in the past', () => {
    expect(
      buildBalanceProjection({
        lastRealPoint: LAST_REAL,
        plans: [income(at(2026, 7, 20), 100)],
        periodEnd: day(2026, 7, 31),
        now: NOW,
      }),
    ).toBeNull();
  });

  it('steps cumulatively in date order, income up and expense down', () => {
    const projection = buildBalanceProjection({
      lastRealPoint: LAST_REAL,
      plans: [expense(at(2026, 8, 20), 1300), income(at(2026, 8, 15), 5000)],
      periodEnd: PERIOD_END,
      now: NOW,
    });

    expect(projection).not.toBeNull();
    expect(projection!.steps.map((s) => ({ date: s.date, value: s.value }))).toEqual([
      { date: day(2026, 8, 15), value: 12400 },
      { date: day(2026, 8, 20), value: 11100 },
    ]);
    expect(projection!.projectedValue).toBe(11100);
    expect(projection!.planCount).toBe(2);
  });

  it('clamps past-dated pending plans to today instead of bending the line backwards', () => {
    const projection = buildBalanceProjection({
      lastRealPoint: LAST_REAL,
      plans: [income(at(2026, 8, 5), 500)],
      periodEnd: PERIOD_END,
      now: NOW,
    });

    expect(projection!.steps).toHaveLength(1);
    expect(projection!.steps[0]!.date).toBe(startOfDay(NOW).getTime());
    expect(projection!.projectedValue).toBe(7900);
  });

  it('drops plans dated after the period end from value, count and label scope', () => {
    const inScopeTime = at(2026, 8, 15);
    const projection = buildBalanceProjection({
      lastRealPoint: LAST_REAL,
      plans: [income(inScopeTime, 100), income(at(2026, 9, 2), 9999)],
      periodEnd: PERIOD_END,
      now: NOW,
    });

    expect(projection!.planCount).toBe(1);
    expect(projection!.projectedValue).toBe(7500);
    expect(projection!.latestPlanTime).toBe(inScopeTime);
  });

  it('merges same-day plans into one step and keeps each plan label', () => {
    const projection = buildBalanceProjection({
      lastRealPoint: LAST_REAL,
      plans: [income(at(2026, 8, 15, 9), 5000, 'salary'), expense(at(2026, 8, 15, 18), 200, 'rent')],
      periodEnd: PERIOD_END,
      now: NOW,
    });

    expect(projection!.steps).toHaveLength(1);
    expect(projection!.steps[0]!.value).toBe(12200);
    expect(projection!.steps[0]!.planLabels).toEqual([
      { refDelta: 5000, note: 'salary' },
      { refDelta: -200, note: 'rent' },
    ]);
  });

  it('skips plans whose time cannot be parsed', () => {
    const inScopeTime = at(2026, 8, 15);
    const projection = buildBalanceProjection({
      lastRealPoint: LAST_REAL,
      plans: [income('not-a-date', 100), income(inScopeTime, 5000)],
      periodEnd: PERIOD_END,
      now: NOW,
    });

    expect(projection!.planCount).toBe(1);
    expect(projection!.projectedValue).toBe(12400);
    expect(projection!.latestPlanTime).toBe(inScopeTime);
  });

  it('skips plans whose refAmount is not finite', () => {
    const projection = buildBalanceProjection({
      lastRealPoint: LAST_REAL,
      plans: [income(at(2026, 8, 14), Number.NaN), expense(at(2026, 8, 16), Infinity), income(at(2026, 8, 15), 5000)],
      periodEnd: PERIOD_END,
      now: NOW,
    });

    expect(projection!.planCount).toBe(1);
    expect(projection!.projectedValue).toBe(12400);
    expect(projection!.points.every((point) => Number.isFinite(point.value))).toBe(true);
  });

  it('returns null when every plan is malformed', () => {
    expect(
      buildBalanceProjection({
        lastRealPoint: LAST_REAL,
        plans: [income('not-a-date', 100), income(at(2026, 8, 15), Number.NaN)],
        periodEnd: PERIOD_END,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('anchors at the last real point and holds the final level to the period end', () => {
    const projection = buildBalanceProjection({
      lastRealPoint: LAST_REAL,
      plans: [income(at(2026, 8, 15), 5000)],
      periodEnd: PERIOD_END,
      now: NOW,
    });

    expect(projection!.points[0]).toEqual(LAST_REAL);
    expect(projection!.points[projection!.points.length - 1]).toEqual({ date: PERIOD_END, value: 12400 });
  });
});
