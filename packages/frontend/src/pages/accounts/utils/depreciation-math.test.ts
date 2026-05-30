import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import { addMonths, addYears } from 'date-fns';
import { describe, expect, it } from 'vitest';

import { buildDepreciationTimeline, getSalvageFloorValue } from './depreciation-math';

const purchaseDate = new Date('2024-01-15T00:00:00Z');
const purchaseValue = 30_000;

const baseParams = {
  vehicleClass: VEHICLE_CLASS.sedan,
  preset: DEPRECIATION_PRESET.average,
  salvageFloorPct: 10,
};

describe('buildDepreciationTimeline', () => {
  describe('no override', () => {
    it('returns a single segment of length monthsHorizon + 1 (anchor + one point per month)', () => {
      const monthsHorizon = 24;
      const timeline = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon,
      });

      expect(timeline).toHaveLength(monthsHorizon + 1);
    });

    it('treats a null override as no override', () => {
      const monthsHorizon = 12;
      const withNull = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        override: null,
        monthsHorizon,
      });
      const withoutKey = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon,
      });

      expect(withNull).toEqual(withoutKey);
    });

    it('produces a monotonically non-increasing curve (depreciation never grows the value)', () => {
      const timeline = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon: 60,
      });

      for (let i = 1; i < timeline.length; i += 1) {
        expect(timeline[i]!.value).toBeLessThanOrEqual(timeline[i - 1]!.value);
      }
    });

    it('walks one month at a time — points are spaced exactly one month apart', () => {
      const timeline = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon: 6,
      });

      for (let i = 1; i < timeline.length; i += 1) {
        const expectedDate = addMonths(purchaseDate, i);
        expect(timeline[i]!.date.getTime()).toBe(expectedDate.getTime());
      }
    });
  });

  describe('first point is the anchor', () => {
    it('starts with the purchase date and value untouched', () => {
      const timeline = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon: 12,
      });

      const first = timeline[0]!;
      expect(first.value).toBe(purchaseValue);
      expect(first.date.getTime()).toBe(purchaseDate.getTime());
    });

    it('returns a fresh Date instance for the anchor (not the same reference as the input)', () => {
      const timeline = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon: 1,
      });

      // Defensive copy: callers shouldn't be able to mutate our points by mutating their input.
      expect(timeline[0]!.date).not.toBe(purchaseDate);
    });
  });

  describe('override after purchase', () => {
    const overrideDate = addYears(purchaseDate, 1);
    const overrideValue = 25_000;

    it('emits two same-date points at the override date (vertical kink)', () => {
      const timeline = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        override: { value: overrideValue, date: overrideDate },
        monthsHorizon: 24,
      });

      const overrideTime = overrideDate.getTime();
      const atOverride = timeline.filter((p) => p.date.getTime() === overrideTime);
      expect(atOverride).toHaveLength(2);

      const [preCurveAtKink, postJumpAtKink] = atOverride;
      // Pre-curve sample at the override date should be the depreciated value (< purchase, > 0).
      expect(preCurveAtKink!.value).toBeLessThan(purchaseValue);
      expect(preCurveAtKink!.value).toBeGreaterThan(0);
      // Post-jump should be the override value exactly.
      expect(postJumpAtKink!.value).toBe(overrideValue);
      // The two must differ — that's what makes the line vertical.
      expect(preCurveAtKink!.value).not.toBe(postJumpAtKink!.value);
    });

    it('continues projecting from the override value for monthsHorizon months after the override', () => {
      const monthsHorizon = 24;
      const timeline = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        override: { value: overrideValue, date: overrideDate },
        monthsHorizon,
      });

      const lastPoint = timeline[timeline.length - 1]!;
      const expectedEnd = addMonths(overrideDate, monthsHorizon);
      expect(lastPoint.date.getTime()).toBe(expectedEnd.getTime());
    });

    it('post-override segment starts decaying from the override value (not the pre-curve value)', () => {
      const timeline = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        override: { value: overrideValue, date: overrideDate },
        monthsHorizon: 12,
      });

      // First point strictly after the override date.
      const overrideTime = overrideDate.getTime();
      const firstAfter = timeline.find((p) => p.date.getTime() > overrideTime)!;
      expect(firstAfter).toBeDefined();
      // Should be slightly below the override value (one month of decay) — not below the pre-curve value.
      expect(firstAfter.value).toBeLessThanOrEqual(overrideValue);
      expect(firstAfter.value).toBeGreaterThan(overrideValue * 0.95);
    });
  });

  describe('override at exactly purchase date', () => {
    it('behaves as a single segment from purchase forward (no kink)', () => {
      const monthsHorizon = 12;
      const withCoincidentOverride = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        // Same date as purchase — the hasOverride guard requires strict inequality.
        override: { value: 99_999, date: new Date(purchaseDate.getTime()) },
        monthsHorizon,
      });
      const withoutOverride = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon,
      });

      expect(withCoincidentOverride).toEqual(withoutOverride);
    });
  });

  describe('override before purchase', () => {
    it('treats an earlier override as no override (ignored by hasOverride guard)', () => {
      const monthsHorizon = 12;
      const withEarlierOverride = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        override: { value: 99_999, date: addMonths(purchaseDate, -6) },
        monthsHorizon,
      });
      const withoutOverride = buildDepreciationTimeline({
        ...baseParams,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon,
      });

      expect(withEarlierOverride).toEqual(withoutOverride);
    });
  });

  describe('salvage floor clamps', () => {
    it('30-year horizon stays >= purchase * salvageFloorPct/100 (never lower)', () => {
      const salvageFloorPct = 10;
      const floor = purchaseValue * (salvageFloorPct / 100);

      const timeline = buildDepreciationTimeline({
        ...baseParams,
        salvageFloorPct,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon: 30 * 12,
      });

      for (const point of timeline) {
        expect(point.value).toBeGreaterThanOrEqual(floor);
      }
    });

    it('floor is based on original purchase (not override), so post-override clamps to the same minimum', () => {
      const salvageFloorPct = 10;
      const floor = purchaseValue * (salvageFloorPct / 100);

      const timeline = buildDepreciationTimeline({
        ...baseParams,
        salvageFloorPct,
        purchase: { value: purchaseValue, date: purchaseDate },
        // Override much later — post-override segment should still respect the original floor.
        override: { value: purchaseValue * 0.4, date: addYears(purchaseDate, 5) },
        monthsHorizon: 30 * 12,
      });

      for (const point of timeline) {
        expect(point.value).toBeGreaterThanOrEqual(floor);
      }
    });
  });

  describe('custom rate', () => {
    it('month-12 value with customAnnualRatePct=10 is approximately purchase * 0.9', () => {
      const timeline = buildDepreciationTimeline({
        vehicleClass: VEHICLE_CLASS.sedan,
        preset: DEPRECIATION_PRESET.custom,
        customAnnualRatePct: 10,
        salvageFloorPct: 0,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon: 12,
      });

      // Month 12 sits exactly at the 1-year anniversary, so the full annual rate has applied.
      const monthTwelve = timeline[12]!;
      const expected = purchaseValue * 0.9;
      // Backend uses date-fns calendar-day math; tolerance covers DST / day-count rounding.
      expect(monthTwelve.value).toBeCloseTo(expected, 0);
      expect(Math.abs(monthTwelve.value - expected) / expected).toBeLessThan(0.005);
    });

    it('custom rate of 0 produces a flat line at the purchase value', () => {
      const timeline = buildDepreciationTimeline({
        vehicleClass: VEHICLE_CLASS.sedan,
        preset: DEPRECIATION_PRESET.custom,
        customAnnualRatePct: 0,
        salvageFloorPct: 0,
        purchase: { value: purchaseValue, date: purchaseDate },
        monthsHorizon: 24,
      });

      for (const point of timeline) {
        expect(point.value).toBe(purchaseValue);
      }
    });
  });
});

describe('getSalvageFloorValue', () => {
  it('returns anchorValue * salvageFloorPct / 100', () => {
    expect(getSalvageFloorValue({ anchorValue: 30_000, salvageFloorPct: 10 })).toBe(3_000);
    expect(getSalvageFloorValue({ anchorValue: 12_345, salvageFloorPct: 25 })).toBe(12_345 * 0.25);
  });

  it('returns 0 when salvage floor percent is 0', () => {
    expect(getSalvageFloorValue({ anchorValue: 30_000, salvageFloorPct: 0 })).toBe(0);
  });

  it('returns the anchor value when salvage floor percent is 100', () => {
    expect(getSalvageFloorValue({ anchorValue: 30_000, salvageFloorPct: 100 })).toBe(30_000);
  });
});

// Backend parity guard: ensures the frontend timeline never drifts from the
// authoritative backend math (`computeVehicleValue`).
//
// Skipped because the backend service depends on `@common/types/money` (a
// backend-only path alias) and `big.js`, neither of which is reachable from
// the frontend Vitest setup without invasive config. Re-enable if/when the
// pure-math portion is extracted into the shared package.
describe.skip('backend parity (computeVehicleValue)', () => {
  it('FE timeline value at month 18 matches BE computeVehicleValue within 0.5%', async () => {
    // Intentionally left as skipped scaffold — see describe.skip note above.
    // const { computeVehicleValue } = await import(
    //   '../../../../../backend/src/services/vehicles/compute-vehicle-value'
    // );
    // const { Money } = await import('../../../../../backend/src/common/types/money');
    //
    // const asOf = addMonths(purchaseDate, 18);
    // const beValue = computeVehicleValue({
    //   anchorValue: Money.fromDecimal(purchaseValue),
    //   anchorDate: purchaseDate,
    //   asOf,
    //   vehicleClass: VEHICLE_CLASS.sedan,
    //   preset: DEPRECIATION_PRESET.average,
    //   salvageFloorPct: 10,
    // }).toNumber();
    //
    // const timeline = buildDepreciationTimeline({
    //   ...baseParams,
    //   purchase: { value: purchaseValue, date: purchaseDate },
    //   monthsHorizon: 24,
    // });
    // const feValue = timeline[18]!.value;
    //
    // expect(Math.abs(feValue - beValue) / beValue).toBeLessThan(0.005);
  });
});
