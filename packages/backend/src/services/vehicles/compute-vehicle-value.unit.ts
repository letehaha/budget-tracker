import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';

import { computeVehicleValue } from './compute-vehicle-value';
import { CLASS_DEFAULT_CURVES, PRESET_MULTIPLIERS, TAIL_RATE_PCT } from './depreciation-curves';

/**
 * Unit tests for the pure `computeVehicleValue` depreciation math.
 *
 * The function is intentionally side-effect-free: no DB, no clock — the caller
 * supplies every input including `asOf`. These tests exercise the math directly
 * with hand-rolled inputs and compare against arithmetic computed off the same
 * curve constants so the tests stay correct if the curve numbers change.
 */
describe('computeVehicleValue', () => {
  // Stable anchor used by most cases. Picking a non-leap year keeps the
  // partial-year proration arithmetic predictable (365 days per anniversary).
  const anchorDate = new Date('2023-01-01T00:00:00Z');
  const anchorValue = Money.fromDecimal(30000);
  const salvageFloorPct = 10;

  describe('boundary dates', () => {
    it('returns anchor value unchanged when asOf is before anchorDate', () => {
      const result = computeVehicleValue({
        anchorValue,
        anchorDate,
        asOf: new Date('2022-06-15T00:00:00Z'),
        vehicleClass: VEHICLE_CLASS.sedan,
        preset: DEPRECIATION_PRESET.classDefault,
        salvageFloorPct,
      });

      expect(result.toNumber()).toBe(30000);
    });

    it('returns anchor value unchanged when asOf is exactly anchorDate', () => {
      const result = computeVehicleValue({
        anchorValue,
        anchorDate,
        asOf: new Date('2023-01-01T00:00:00Z'),
        vehicleClass: VEHICLE_CLASS.sedan,
        preset: DEPRECIATION_PRESET.classDefault,
        salvageFloorPct,
      });

      expect(result.toNumber()).toBe(30000);
    });
  });

  describe('class-default preset', () => {
    it('applies the sedan year-1 rate of 20% after exactly one year', () => {
      const result = computeVehicleValue({
        anchorValue,
        anchorDate,
        asOf: new Date('2024-01-01T00:00:00Z'),
        vehicleClass: VEHICLE_CLASS.sedan,
        preset: DEPRECIATION_PRESET.classDefault,
        salvageFloorPct,
      });

      // Curve year 0 for sedan = 20%, average multiplier = 1.0 → 30000 * 0.80 = 24000.
      const expectedRate = CLASS_DEFAULT_CURVES[VEHICLE_CLASS.sedan][0]! / 100;
      expect(expectedRate).toBe(0.2);
      expect(result.toNumber()).toBeCloseTo(30000 * (1 - expectedRate), 4);
      expect(result.toNumber()).toBe(24000);
    });
  });

  describe('custom preset', () => {
    it('compounds the flat custom rate year over year (10% twice ≈ 0.9²)', () => {
      const result = computeVehicleValue({
        anchorValue: Money.fromDecimal(20000),
        anchorDate,
        asOf: new Date('2025-01-01T00:00:00Z'),
        vehicleClass: VEHICLE_CLASS.sedan, // class is irrelevant for custom
        preset: DEPRECIATION_PRESET.custom,
        customAnnualRatePct: 10,
        salvageFloorPct,
      });

      // 20000 * 0.9 * 0.9 = 16200
      expect(result.toNumber()).toBeCloseTo(20000 * 0.9 * 0.9, 4);
      expect(result.toNumber()).toBe(16200);
    });

    it('treats customAnnualRatePct=null as 0% (value unchanged across many years)', () => {
      const result = computeVehicleValue({
        anchorValue: Money.fromDecimal(50000),
        anchorDate,
        asOf: new Date('2028-01-01T00:00:00Z'), // 5 years later
        vehicleClass: VEHICLE_CLASS.luxury,
        preset: DEPRECIATION_PRESET.custom,
        customAnnualRatePct: null,
        salvageFloorPct,
      });

      expect(result.toNumber()).toBe(50000);
    });
  });

  describe('preset multipliers (slow / average / fast)', () => {
    const asOf = new Date('2024-01-01T00:00:00Z'); // exactly one year

    function runWithPreset(preset: DEPRECIATION_PRESET) {
      return computeVehicleValue({
        anchorValue,
        anchorDate,
        asOf,
        vehicleClass: VEHICLE_CLASS.sedan,
        preset,
        salvageFloorPct,
      }).toNumber();
    }

    it('slow preset produces a smaller drop than average', () => {
      const slow = runWithPreset(DEPRECIATION_PRESET.slow);
      const average = runWithPreset(DEPRECIATION_PRESET.average);

      // Sedan year 0 = 20%, slow multiplier = 0.7 → effective 14% → 30000 * 0.86 = 25800.
      const expected = 30000 * (1 - (20 * PRESET_MULTIPLIERS.slow) / 100);
      expect(slow).toBeCloseTo(expected, 4);
      expect(slow).toBe(25800);

      // Slow leaves more value behind than average.
      expect(slow).toBeGreaterThan(average);
    });

    it('fast preset produces a larger drop than average', () => {
      const fast = runWithPreset(DEPRECIATION_PRESET.fast);
      const average = runWithPreset(DEPRECIATION_PRESET.average);

      // Sedan year 0 = 20%, fast multiplier = 1.3 → effective 26% → 30000 * 0.74 = 22200.
      const expected = 30000 * (1 - (20 * PRESET_MULTIPLIERS.fast) / 100);
      expect(fast).toBeCloseTo(expected, 4);
      expect(fast).toBe(22200);

      expect(fast).toBeLessThan(average);
    });

    it('average preset matches classDefault for the same year', () => {
      const average = runWithPreset(DEPRECIATION_PRESET.average);
      const classDefault = runWithPreset(DEPRECIATION_PRESET.classDefault);

      expect(average).toBeCloseTo(classDefault, 6);
    });
  });

  describe('class curves', () => {
    it('luxury class drops faster than sedan in year 1 (same preset)', () => {
      const sharedInputs = {
        anchorValue,
        anchorDate,
        asOf: new Date('2024-01-01T00:00:00Z'),
        preset: DEPRECIATION_PRESET.classDefault,
        salvageFloorPct,
      };

      const sedan = computeVehicleValue({
        ...sharedInputs,
        vehicleClass: VEHICLE_CLASS.sedan,
      }).toNumber();
      const luxury = computeVehicleValue({
        ...sharedInputs,
        vehicleClass: VEHICLE_CLASS.luxury,
      }).toNumber();

      // Sedan year 0 = 20%, luxury year 0 = 25% → luxury ends up lower.
      expect(luxury).toBeLessThan(sedan);
      expect(sedan).toBe(24000); // 30000 * 0.80
      expect(luxury).toBe(22500); // 30000 * 0.75
    });
  });

  describe('salvage floor clamp', () => {
    it('clamps to anchorValue * salvageFloorPct/100 on a very long horizon', () => {
      const anchor = Money.fromDecimal(100000);
      const floorPct = 30;

      const result = computeVehicleValue({
        anchorValue: anchor,
        anchorDate,
        asOf: new Date('2053-01-01T00:00:00Z'), // 30 years later
        vehicleClass: VEHICLE_CLASS.sedan,
        preset: DEPRECIATION_PRESET.classDefault,
        salvageFloorPct: floorPct,
      });

      // After enough compounding the running value drops below 30% of 100000;
      // the function then returns the floor exactly.
      expect(result.toNumber()).toBe(30000);
      expect(result.toNumber()).toBe(100000 * (floorPct / 100));
    });
  });

  describe('TAIL_RATE_PCT fallback', () => {
    it('keeps depreciating past the explicit curve length using TAIL_RATE_PCT', () => {
      // Sedan curve has 10 entries (years 0..9). Past year 10 the function
      // falls back to TAIL_RATE_PCT for every remaining year.
      const sedanCurveLength = CLASS_DEFAULT_CURVES[VEHICLE_CLASS.sedan].length;
      expect(sedanCurveLength).toBe(10);
      expect(TAIL_RATE_PCT).toBeGreaterThan(0);

      const anchor = Money.fromDecimal(100000);

      // Use `slow` preset so the rate stays well above the floor and we can
      // observe continued decay rather than a clamp.
      const inputs = {
        anchorValue: anchor,
        anchorDate,
        vehicleClass: VEHICLE_CLASS.sedan,
        preset: DEPRECIATION_PRESET.slow,
        salvageFloorPct: 1, // effectively no floor for this assertion
      };

      // Year 10 = first year using TAIL_RATE_PCT.
      const atYear10 = computeVehicleValue({
        ...inputs,
        asOf: new Date('2033-01-01T00:00:00Z'),
      }).toNumber();

      // Year 20 = 10 more applications of TAIL_RATE_PCT * slow-multiplier.
      const atYear20 = computeVehicleValue({
        ...inputs,
        asOf: new Date('2043-01-01T00:00:00Z'),
      }).toNumber();

      // Value at year 20 should be strictly less than at year 10 because
      // every year past the curve still trims TAIL_RATE_PCT (not zero).
      expect(atYear20).toBeLessThan(atYear10);

      // And the ratio between year 10 and year 20 should match 10 compounded
      // years at the tail rate (× slow multiplier).
      const tailRatePerYear = (TAIL_RATE_PCT * PRESET_MULTIPLIERS.slow) / 100;
      const expectedRatio = (1 - tailRatePerYear) ** 10;
      expect(atYear20 / atYear10).toBeCloseTo(expectedRatio, 4);
    });
  });

  describe('partial final year proration', () => {
    it('halves the year-1 rate when ~6 months have elapsed', () => {
      // Jan 1 2023 → Jul 1 2023 = 181 days, anniversary year length = 365 days.
      // Sedan year 0 = 20%, prorated by 181/365 ≈ 0.4959 → effective ~9.92%.
      const result = computeVehicleValue({
        anchorValue,
        anchorDate,
        asOf: new Date('2023-07-01T00:00:00Z'),
        vehicleClass: VEHICLE_CLASS.sedan,
        preset: DEPRECIATION_PRESET.classDefault,
        salvageFloorPct,
      });

      const yearOneRate = CLASS_DEFAULT_CURVES[VEHICLE_CLASS.sedan][0]! / 100;
      const expectedFraction = 181 / 365;
      const expected = 30000 * (1 - yearOneRate * expectedFraction);

      expect(result.toNumber()).toBeCloseTo(expected, 4);

      // And it should be roughly halfway between "no time has passed" (30000)
      // and "a full year has passed" (30000 * 0.80 = 24000).
      expect(result.toNumber()).toBeGreaterThan(26900);
      expect(result.toNumber()).toBeLessThan(27100);
    });
  });
});
