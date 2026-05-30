import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import { differenceInCalendarDays } from 'date-fns';

/**
 * Mirrors `packages/backend/src/services/vehicles/depreciation-curves.ts`.
 * Frontend-only copy lets the depreciation chart project the curve forward
 * without an extra API round-trip. If backend curves change, update both files.
 */
const CLASS_DEFAULT_CURVES: Record<VEHICLE_CLASS, number[]> = {
  [VEHICLE_CLASS.sedan]: [20, 15, 12, 10, 8, 7, 6, 5, 5, 4],
  [VEHICLE_CLASS.suv]: [18, 14, 11, 10, 8, 7, 6, 5, 5, 4],
  [VEHICLE_CLASS.truck]: [15, 12, 10, 9, 8, 7, 6, 5, 5, 4],
  [VEHICLE_CLASS.luxury]: [25, 18, 14, 12, 10, 8, 7, 6, 5, 5],
  [VEHICLE_CLASS.ev]: [22, 17, 13, 10, 8, 7, 6, 5, 5, 4],
  [VEHICLE_CLASS.motorcycle]: [20, 15, 12, 10, 8, 7, 6, 5, 5, 4],
  [VEHICLE_CLASS.other]: [20, 15, 12, 10, 8, 7, 6, 5, 5, 4],
};

const TAIL_RATE_PCT = 4;

const PRESET_MULTIPLIERS = {
  slow: 0.7,
  average: 1.0,
  fast: 1.3,
} as const;

interface ResolveRateParams {
  vehicleClass: VEHICLE_CLASS;
  preset: DEPRECIATION_PRESET;
  customAnnualRatePct?: number | null;
  /** Years elapsed since the START of the current segment, not since purchase. */
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

interface SegmentParams extends CurveParams {
  anchorValue: number;
  anchorDate: Date;
  endDate: Date;
  /** Salvage floor is shared across segments — it's a fraction of original purchase. */
  floor: number;
}

/**
 * Walk a single curve segment month-by-month, depreciating from `anchorValue`
 * at `anchorDate` until `endDate`. Floors at `floor`. Year indexing resets at
 * the segment start — this matches Edmunds-style curves where the year-1 hit
 * is steepest and gentles out, applied freshly from any anchor (purchase or
 * override). Emits one point per month-end, plus the segment-start point.
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

  let current = anchorValue;
  let month = 1;

  while (true) {
    const date = new Date(anchorDate);
    date.setMonth(date.getMonth() + month);
    if (date > endDate) break;

    const daysFromAnchor = differenceInCalendarDays(date, anchorDate);
    const yearIndex = Math.floor(daysFromAnchor / 365);
    const rate = resolveAnnualRate({ vehicleClass, preset, customAnnualRatePct, yearIndex });
    const monthlyRate = rate / 12;

    current = current * (1 - monthlyRate);
    if (current < floor) current = floor;

    points.push({ date, value: current });
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
    const endDate = new Date(purchase.date);
    endDate.setMonth(endDate.getMonth() + monthsHorizon);
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

  const projectionEnd = new Date(override!.date);
  projectionEnd.setMonth(projectionEnd.getMonth() + monthsHorizon);
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
