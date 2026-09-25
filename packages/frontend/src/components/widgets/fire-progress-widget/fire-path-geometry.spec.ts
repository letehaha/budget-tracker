import type { FireChart } from '@/composable/fire/build-fire-plan';
import { describe, expect, it } from 'vitest';

import { PLOT_BOTTOM_PX, PLOT_TOP_PX, buildFirePathGeometry, labelAnchor } from './fire-path-geometry';

const WIDTH = 400;
const HEIGHT = 200;

const series = ({ length, from, start = 0, step = 1 }: { length: number; from: Date; start?: number; step?: number }) =>
  Array.from({ length }, (_, m) => ({
    date: new Date(from.getFullYear(), from.getMonth() + m, 1),
    value: start + m * step,
  }));

const buildChart = (overrides: Partial<FireChart> = {}): FireChart => ({
  history: series({ length: 12, from: new Date(2025, 8, 1), start: 0, step: 10 }),
  projection: series({ length: 120, from: new Date(2026, 8, 1), start: 110, step: 10 }),
  rangeHigh: null,
  rangeLow: null,
  targetLine: 500,
  milestoneMonths: [],
  fireMonth: 40,
  ...overrides,
});

describe('buildFirePathGeometry', () => {
  it('spans history start to the padded projection end, with today between them', () => {
    const geometry = buildFirePathGeometry({ chart: buildChart(), width: WIDTH, height: HEIGHT })!;

    expect(geometry.startDate).toEqual(new Date(2025, 8, 1));
    expect(geometry.endDate).toEqual(new Date(2026, 8 + 64, 1));
    expect(geometry.todayX).toBeGreaterThan(0);
    expect(geometry.todayX).toBeLessThan(WIDTH);
    expect(geometry.historyLine).toMatch(/^M0,/);
    expect(geometry.historyArea).not.toBeNull();
  });

  it('places the FIRE dot on the target line at the FIRE month', () => {
    const chart = buildChart({ targetLine: 510 });
    const geometry = buildFirePathGeometry({ chart, width: WIDTH, height: HEIGHT })!;

    expect(geometry.fireDot).not.toBeNull();
    expect(geometry.fireDot!.date).toEqual(chart.projection[40]!.date);
    expect(geometry.fireDot!.y).toBeCloseTo(geometry.targetY);
    expect(geometry.fireDot!.x).toBeGreaterThan(geometry.todayX);
  });

  it('places milestone dots on the projection at their hit months', () => {
    const chart = buildChart({
      milestoneMonths: [
        { pct: 25, month: 5 },
        { pct: 50, month: 400 },
      ],
    });
    const geometry = buildFirePathGeometry({ chart, width: WIDTH, height: HEIGHT })!;

    expect(geometry.milestoneDots).toHaveLength(1);
    expect(geometry.milestoneDots[0]!.pct).toBe(25);
    expect(geometry.milestoneDots[0]!.x).toBeGreaterThan(geometry.todayX);
    expect(geometry.milestoneDots[0]!.x).toBeLessThan(geometry.fireDot!.x);
  });

  it('keeps the target line inside the plot even when the path never gets there', () => {
    const chart = buildChart({
      projection: series({ length: 400, from: new Date(2026, 8, 1), start: 10, step: 0 }),
      targetLine: 10_000,
      fireMonth: null,
    });
    const geometry = buildFirePathGeometry({ chart, width: WIDTH, height: HEIGHT })!;

    expect(geometry.fireDot).toBeNull();
    expect(geometry.targetY).toBeGreaterThanOrEqual(PLOT_TOP_PX);
    expect(geometry.targetY).toBeLessThan(HEIGHT - PLOT_BOTTOM_PX);
  });

  it('starts at today and skips the history path when there is no history', () => {
    const geometry = buildFirePathGeometry({ chart: buildChart({ history: [] }), width: WIDTH, height: HEIGHT })!;

    expect(geometry.todayX).toBe(0);
    expect(geometry.historyLine).toBeNull();
    expect(geometry.historyArea).toBeNull();
  });

  it('returns null before the container has a usable size', () => {
    expect(buildFirePathGeometry({ chart: buildChart(), width: 0, height: HEIGHT })).toBeNull();
    expect(buildFirePathGeometry({ chart: buildChart(), width: WIDTH, height: 20 })).toBeNull();
  });
});

describe('labelAnchor', () => {
  it('keeps labels inside the plot near both edges', () => {
    expect(labelAnchor({ x: 5, width: WIDTH })).toBe('start');
    expect(labelAnchor({ x: 200, width: WIDTH })).toBe('middle');
    expect(labelAnchor({ x: 395, width: WIDTH })).toBe('end');
  });
});
