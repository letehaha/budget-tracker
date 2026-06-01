import {
  CLASS_DEFAULT_CURVES,
  DEPRECIATION_PRESET,
  PRESET_MULTIPLIERS,
  TAIL_RATE_PCT,
  VEHICLE_CLASS,
} from '@bt/shared/types';
import { addMonths, addYears, differenceInCalendarDays } from 'date-fns';

interface ResolveRateParams {
  vehicleClass: VEHICLE_CLASS;
  preset: DEPRECIATION_PRESET;
  customAnnualRatePct?: number | null;
  /** Year index since segment anchor (0 = the first 12 months from anchor). */
  yearIndex: number;
}

function resolveAnnualRate({ vehicleClass, preset, customAnnualRatePct, yearIndex }: ResolveRateParams): number {
  if (preset === DEPRECIATION_PRESET.custom) {
    return (customAnnualRatePct ?? 0) / 100;
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

interface CurveParams {
  vehicleClass: VEHICLE_CLASS;
  preset: DEPRECIATION_PRESET;
  customAnnualRatePct?: number | null;
  salvageFloorPct: number;
}

export interface DepreciationPoint {
  date: Date;
  value: number;
}

interface SampleAtParams extends CurveParams {
  anchorValue: number;
  anchorDate: Date;
  asOf: Date;
  /** Salvage floor is shared across segments — it's a fraction of original purchase. */
  floor: number;
}

/**
 * Pure depreciation math — mirrors the backend's `computeVehicleValue`:
 * walk year-by-year from `anchorDate` applying compound annual depreciation,
 * prorate the partial final year by elapsed days, floor at salvage.
 *
 * Keeping the frontend math identical to the backend's prevents the chart from
 * silently diverging from the headline current-value figure.
 */
function sampleValueAt({
  anchorValue,
  anchorDate,
  asOf,
  vehicleClass,
  preset,
  customAnnualRatePct,
  floor,
}: SampleAtParams): number {
  const daysElapsed = differenceInCalendarDays(asOf, anchorDate);
  if (daysElapsed <= 0) {
    return anchorValue;
  }

  let value = anchorValue;
  let cursor = anchorDate;
  let yearIndex = 0;

  while (true) {
    const nextAnniversary = addYears(cursor, 1);
    if (asOf >= nextAnniversary) {
      const rate = resolveAnnualRate({ vehicleClass, preset, customAnnualRatePct, yearIndex });
      value = value * (1 - rate);
      if (value < floor) return floor;
      cursor = nextAnniversary;
      yearIndex += 1;
      continue;
    }

    const daysInYear = differenceInCalendarDays(nextAnniversary, cursor);
    const partialDays = differenceInCalendarDays(asOf, cursor);
    if (partialDays > 0 && daysInYear > 0) {
      const rate = resolveAnnualRate({ vehicleClass, preset, customAnnualRatePct, yearIndex });
      const proratedRate = rate * (partialDays / daysInYear);
      value = value * (1 - proratedRate);
      if (value < floor) return floor;
    }
    return value;
  }
}

interface SegmentParams extends CurveParams {
  anchorValue: number;
  anchorDate: Date;
  endDate: Date;
  floor: number;
}

/**
 * Walk a single segment month-by-month, sampling the curve at each month-end.
 * The per-month sampling uses `sampleValueAt` (the backend-matching math), so
 * every point on the line agrees with what the backend would say at that date.
 */
function buildSegment({
  anchorValue,
  anchorDate,
  endDate,
  vehicleClass,
  preset,
  customAnnualRatePct,
  floor,
}: SegmentParams): DepreciationPoint[] {
  const points: DepreciationPoint[] = [{ date: new Date(anchorDate), value: anchorValue }];

  let month = 1;
  while (true) {
    const date = addMonths(anchorDate, month);
    if (date > endDate) break;

    const value = sampleValueAt({
      anchorValue,
      anchorDate,
      asOf: date,
      vehicleClass,
      preset,
      customAnnualRatePct,
      floor,
      salvageFloorPct: 0,
    });

    points.push({ date, value });
    month += 1;
  }

  return points;
}

interface BuildTimelineParams extends CurveParams {
  purchase: { value: number; date: Date };
  /** Latest override (if any). Splits the curve into two segments meeting at this date/value. */
  override?: { value: number; date: Date } | null;
  /** How far past the latest anchor (override or purchase) to project. */
  monthsHorizon: number;
}

/**
 * Build the value-over-time timeline. When `override` is provided AND its date
 * is strictly after purchase, the curve has two segments meeting in a vertical
 * "kink" at the override date:
 *
 *   purchase ──curve──► (curve-value @ override.date)
 *                      │
 *                      │ ◄── instantaneous re-anchor jump
 *                      ▼
 *                    (override.value) ──curve──► projection
 *
 * If override is missing/null/at purchase, behaves as a single segment from
 * purchase forward. Salvage floor is a fraction of the original purchase price
 * (not the override) so the floor stays meaningful across re-anchors.
 */
export function buildDepreciationTimeline({
  purchase,
  override,
  monthsHorizon,
  ...curveParams
}: BuildTimelineParams): DepreciationPoint[] {
  const floor = purchase.value * (curveParams.salvageFloorPct / 100);
  const hasOverride = override != null && override.date.getTime() > purchase.date.getTime();

  if (!hasOverride) {
    const endDate = addMonths(purchase.date, monthsHorizon);
    return buildSegment({ ...curveParams, anchorValue: purchase.value, anchorDate: purchase.date, endDate, floor });
  }

  const preOverride = buildSegment({
    ...curveParams,
    anchorValue: purchase.value,
    anchorDate: purchase.date,
    endDate: override!.date,
    floor,
  });

  // Vertical kink: hold the pre-override curve value at the override date so
  // the line has a visible step, then jump to the override value on the same
  // date. The two same-date points draw a vertical line in the chart.
  const lastPre = preOverride[preOverride.length - 1]!;
  const kinkPoints: DepreciationPoint[] =
    lastPre.date.getTime() === override!.date.getTime()
      ? [{ date: new Date(override!.date), value: override!.value }]
      : [
          { date: new Date(override!.date), value: lastPre.value },
          { date: new Date(override!.date), value: override!.value },
        ];

  const projectionEnd = addMonths(override!.date, monthsHorizon);
  const postOverride = buildSegment({
    ...curveParams,
    anchorValue: override!.value,
    anchorDate: override!.date,
    endDate: projectionEnd,
    floor,
  });

  // Drop postOverride's leading anchor point — kinkPoints already cover that date.
  return [...preOverride, ...kinkPoints, ...postOverride.slice(1)];
}

export function getSalvageFloorValue({
  anchorValue,
  salvageFloorPct,
}: {
  anchorValue: number;
  salvageFloorPct: number;
}): number {
  return anchorValue * (salvageFloorPct / 100);
}
