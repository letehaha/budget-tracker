import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { addYears, differenceInCalendarDays } from 'date-fns';

import { CLASS_DEFAULT_CURVES, PRESET_MULTIPLIERS, TAIL_RATE_PCT } from './depreciation-curves';

interface ResolveCurveParams {
  vehicleClass: VEHICLE_CLASS;
  preset: DEPRECIATION_PRESET;
  customAnnualRatePct?: number | null;
}

/**
 * Resolve a depreciation preset into the per-year annual rate function.
 * Returns rate as a fraction (0.20 = 20%), not a percent.
 *
 * For `custom` preset: every year uses `customAnnualRatePct`.
 * For class-default / slow / average / fast: use class curve scaled by preset multiplier;
 * beyond the explicit curve, fall back to `TAIL_RATE_PCT` (still scaled).
 */
function resolveAnnualRate({
  vehicleClass,
  preset,
  customAnnualRatePct,
  yearIndex,
}: ResolveCurveParams & { yearIndex: number }): number {
  if (preset === DEPRECIATION_PRESET.custom) {
    const rate = customAnnualRatePct ?? 0;
    return rate / 100;
  }

  const curve = CLASS_DEFAULT_CURVES[vehicleClass];
  const basePct = yearIndex < curve.length ? curve[yearIndex]! : TAIL_RATE_PCT;

  const multiplier =
    preset === DEPRECIATION_PRESET.slow
      ? PRESET_MULTIPLIERS.slow
      : preset === DEPRECIATION_PRESET.fast
        ? PRESET_MULTIPLIERS.fast
        : PRESET_MULTIPLIERS.average;

  return (basePct * multiplier) / 100;
}

interface ComputeVehicleValueParams {
  anchorValue: Money;
  anchorDate: Date;
  asOf: Date;
  vehicleClass: VEHICLE_CLASS;
  preset: DEPRECIATION_PRESET;
  customAnnualRatePct?: number | null;
  salvageFloorPct: number;
}

/**
 * Pure depreciation math. No DB, no Date.now() — caller provides `asOf`.
 *
 * Walks year-by-year from `anchorDate`, applying compound depreciation. The
 * partial final year prorates the annual rate by elapsed days. The result is
 * floored at `purchaseValue * salvageFloorPct / 100`.
 *
 * If `asOf` is before `anchorDate`, returns the anchor value unchanged (the
 * caller asked about a date before the vehicle existed for accounting purposes).
 */
export function computeVehicleValue({
  anchorValue,
  anchorDate,
  asOf,
  vehicleClass,
  preset,
  customAnnualRatePct,
  salvageFloorPct,
}: ComputeVehicleValueParams): Money {
  const daysElapsed = differenceInCalendarDays(asOf, anchorDate);
  if (daysElapsed <= 0) {
    return anchorValue;
  }

  const floor = anchorValue.multiply(salvageFloorPct / 100);

  let value = anchorValue;
  let cursor = anchorDate;
  let yearIndex = 0;

  while (true) {
    const nextAnniversary = addYears(cursor, 1);
    if (asOf >= nextAnniversary) {
      const rate = resolveAnnualRate({ vehicleClass, preset, customAnnualRatePct, yearIndex });
      value = value.multiply(1 - rate);
      if (value.lessThan(floor)) {
        return floor;
      }
      cursor = nextAnniversary;
      yearIndex += 1;
      continue;
    }

    // Partial final year: prorate the annual rate by elapsed days.
    const daysInYear = differenceInCalendarDays(nextAnniversary, cursor);
    const partialDays = differenceInCalendarDays(asOf, cursor);
    if (partialDays > 0 && daysInYear > 0) {
      const rate = resolveAnnualRate({ vehicleClass, preset, customAnnualRatePct, yearIndex });
      const proratedRate = rate * (partialDays / daysInYear);
      value = value.multiply(1 - proratedRate);
      if (value.lessThan(floor)) {
        return floor;
      }
    }
    return value;
  }
}
