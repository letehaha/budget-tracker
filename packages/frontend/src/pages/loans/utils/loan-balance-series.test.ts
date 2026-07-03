import { addMonths } from 'date-fns';
import { describe, expect, it } from 'vitest';

import { buildActualBalanceSeries } from './loan-balance-series';

describe('buildActualBalanceSeries', () => {
  const startDate = new Date(2024, 0, 1); // 2024-01-01
  const closedDate = new Date(2024, 3, 1); // 2024-04-01 → 3-month span

  it('resamples history onto a monthly grid ending at zero', () => {
    const points = buildActualBalanceSeries({
      history: [
        { date: '2024-01-15', amount: -900 },
        { date: '2024-02-15', amount: -600 },
        { date: '2024-03-15', amount: -300 },
      ],
      startDate,
      closedDate,
      originalPrincipal: 1000,
    });

    expect(points).toHaveLength(4); // months 0..3
    // Month 0 (2024-01-01) has no record on or before it → falls back to principal.
    expect(points[0]).toMatchObject({ month: 0, balance: 1000 });
    // Later months take the abs of the latest record on or before the month anchor.
    expect(points[1]!.balance).toBe(900);
    expect(points[2]!.balance).toBe(600);
    // Final month is forced to zero to land on the payoff marker.
    expect(points.at(-1)).toMatchObject({ month: 3, balance: 0 });
  });

  it('carries the last known balance forward across gaps', () => {
    const points = buildActualBalanceSeries({
      history: [{ date: '2024-01-10', amount: -800 }],
      startDate,
      closedDate,
      originalPrincipal: 1000,
    });

    // No records after January → months 1 and 2 hold the last known 800, final month 0.
    expect(points[1]!.balance).toBe(800);
    expect(points[2]!.balance).toBe(800);
    expect(points.at(-1)!.balance).toBe(0);
  });

  it('produces the principal→0 fallback when the history is empty', () => {
    const points = buildActualBalanceSeries({
      history: [],
      startDate,
      closedDate,
      originalPrincipal: 1000,
    });

    // No records at all (e.g. the balance-history fetch failed) → every month
    // holds the principal until the forced-zero close, so the actual line still draws.
    expect(points).toHaveLength(4);
    expect(points[0]).toMatchObject({ month: 0, balance: 1000 });
    expect(points[1]!.balance).toBe(1000);
    expect(points[2]!.balance).toBe(1000);
    expect(points.at(-1)).toMatchObject({ month: 3, balance: 0 });
  });

  it('still yields a drawable principal→0 series when the loan opened and closed the same day', () => {
    const sameDay = new Date(2026, 6, 2); // 2026-07-02
    const points = buildActualBalanceSeries({
      history: [{ date: '2026-07-02', amount: 0 }],
      startDate: sameDay,
      closedDate: sameDay,
      originalPrincipal: 24000,
    });

    // Below the chart's monthly resolution → guaranteed 2-point shape, padded
    // to one month so the line has horizontal extent to draw.
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ month: 0, balance: 24000 });
    expect(points[0]!.date).toEqual(sameDay);
    expect(points[1]).toMatchObject({ month: 1, balance: 0 });
    expect(points[1]!.date).toEqual(addMonths(sameDay, 1));
  });

  it('yields the same guaranteed shape for a same-month close with no history at all', () => {
    const points = buildActualBalanceSeries({
      history: [],
      startDate: new Date(2024, 0, 5),
      closedDate: new Date(2024, 0, 20),
      originalPrincipal: 1000,
    });

    expect(points).toHaveLength(2);
    expect(points[0]!.balance).toBe(1000);
    expect(points.at(-1)!.balance).toBe(0);
  });
});
