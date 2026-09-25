import { describe, expect, it } from 'vitest';

import type { FireChart } from './build-fire-plan';
import { displayProgressPct, formatFireCompact, shapeFireChart } from './fire-display';

describe('formatFireCompact', () => {
  it.each([
    [950, '$950'],
    [75_000, '$75K'],
    [52_500, '$52.5K'],
    [254_930, '$255K'],
    [700_000, '$700K'],
    [999_600, '$1M'],
    [1_019_999, '$1.02M'],
    [1_500_000, '$1.5M'],
    [0, '$0'],
    [-52_500, '-$52.5K'],
  ])('%d → %s', (amount, expected) => {
    expect(formatFireCompact({ amount, currency: 'USD' })).toBe(expected);
  });
});

describe('displayProgressPct', () => {
  it('floors to one decimal', () => {
    expect(displayProgressPct({ ratio: 0.40449, reached: false })).toBe(40.4);
  });

  it('caps at 99.9 while not reached', () => {
    expect(displayProgressPct({ ratio: 0.99995, reached: false })).toBe(99.9);
    expect(displayProgressPct({ ratio: 1.2, reached: false })).toBe(99.9);
  });

  it('shows the real value once reached', () => {
    expect(displayProgressPct({ ratio: 1.12, reached: true })).toBe(112);
  });

  it('never goes below zero', () => {
    expect(displayProgressPct({ ratio: -0.3, reached: false })).toBe(0);
  });
});

describe('shapeFireChart', () => {
  const series = ({ length, start = 0 }: { length: number; start?: number }) =>
    Array.from({ length }, (_, m) => ({ date: new Date(2026, 8 + m, 1), value: start + m }));
  const base: FireChart = {
    history: series({ length: 3 }),
    projection: series({ length: 601 }),
    rangeHigh: series({ length: 601, start: 10 }),
    rangeLow: series({ length: 40 }),
    targetLine: 100,
    milestoneMonths: [
      { pct: 25, month: 0 },
      { pct: 50, month: 30 },
    ],
    fireMonth: 100,
  };

  it('cuts the projection 24 months past FIRE', () => {
    const shaped = shapeFireChart({ chart: base });
    expect(shaped.projection).toHaveLength(125);
    expect(shaped.fireDot?.value).toBe(100);
  });

  it('keeps the band only where both branches exist', () => {
    expect(shapeFireChart({ chart: base }).band).toHaveLength(40);
    expect(shapeFireChart({ chart: { ...base, rangeLow: null } }).band).toEqual([]);
  });

  it('drops milestone dots already reached today', () => {
    expect(shapeFireChart({ chart: base }).dots).toEqual([{ pct: 50, month: 30 }]);
  });

  it('shows 30 years when FIRE is out of reach', () => {
    const shaped = shapeFireChart({ chart: { ...base, fireMonth: null } });
    expect(shaped.projection).toHaveLength(361);
    expect(shaped.fireDot).toBeNull();
  });
});
