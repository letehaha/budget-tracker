import { endpointsTypes } from '@bt/shared/types';
import {
  differenceInCalendarDays,
  differenceInCalendarISOWeeks,
  differenceInCalendarMonths,
  differenceInCalendarQuarters,
  differenceInCalendarYears,
} from 'date-fns';

export const MAX_NET_WORTH_HISTORY_BUCKETS = endpointsTypes.MAX_NET_WORTH_HISTORY_BUCKETS;

export interface NetWorthDisplayPoint {
  /** yyyy-MM-dd bucket-end date the snapshot is taken at. */
  date: string;
  assets: number;
  /** Signed per-kind values for the selected kinds only, for the tooltip breakdown. */
  liabilitiesByKind: Partial<Record<endpointsTypes.NetWorthLiabilityKind, number>>;
  /** Sum of the selected kinds' signed values — negative = owed. */
  liabilitiesTotal: number;
  /** assets + liabilitiesTotal; equals the server's netWorth when every kind is selected. */
  netWorth: number;
}

/** Liability kinds with a nonzero balance anywhere in the series, in canonical order. */
export const kindsWithActivity = ({
  points,
}: {
  points: endpointsTypes.NetWorthHistoryPoint[];
}): endpointsTypes.NetWorthLiabilityKind[] =>
  endpointsTypes.NET_WORTH_LIABILITY_KINDS.filter((kind) =>
    points.some((point) => (point.liabilities[kind] ?? 0) !== 0),
  );

/**
 * Empty selection is the "all kinds" sentinel. A stored kind that has no activity
 * in the loaded series is dropped; if nothing valid remains, fall back to all.
 */
export const resolveSelectedKinds = ({
  stored,
  available,
}: {
  stored: endpointsTypes.NetWorthLiabilityKind[];
  available: endpointsTypes.NetWorthLiabilityKind[];
}): endpointsTypes.NetWorthLiabilityKind[] => {
  if (stored.length === 0) return available;
  const availableSet = new Set(available);
  const valid = stored.filter((kind) => availableSet.has(kind));
  return valid.length > 0 ? valid : available;
};

export const buildDisplayPoints = ({
  points,
  selectedKinds,
}: {
  points: endpointsTypes.NetWorthHistoryPoint[];
  selectedKinds: endpointsTypes.NetWorthLiabilityKind[];
}): NetWorthDisplayPoint[] =>
  points.map((point) => {
    const liabilitiesByKind: NetWorthDisplayPoint['liabilitiesByKind'] = {};
    let liabilitiesTotal = 0;
    for (const kind of selectedKinds) {
      const value = point.liabilities[kind] ?? 0;
      liabilitiesByKind[kind] = value;
      liabilitiesTotal += value;
    }
    return {
      date: point.date,
      assets: point.assets,
      liabilitiesByKind,
      liabilitiesTotal,
      netWorth: point.assets + liabilitiesTotal,
    };
  });

/**
 * Mean of the displayed per-point liabilities as a positive "owed" magnitude.
 * A non-negative mean (paid-off or overpaid on average) reads as owing nothing.
 */
export const averageOwedLiabilities = ({ points }: { points: NetWorthDisplayPoint[] }): number => {
  if (points.length === 0) return 0;
  const mean = points.reduce((sum, point) => sum + point.liabilitiesTotal, 0) / points.length;
  return mean < 0 ? -mean : 0;
};

// Owed totals below this share of the positive extreme are invisible on a shared
// linear scale, so the chart switches to a zoomed sub-scale for the owed region.
const ASYMMETRIC_OWED_SHARE_THRESHOLD = 0.1;

export interface LiabilityScale {
  /** Render the owed region on its own zoomed sub-scale instead of the shared one. */
  asymmetric: boolean;
  /** Largest of assets, net worth and positive liability sums across the series. */
  maxPositive: number;
  /** Largest owed magnitude (most negative displayed liabilities total), as a positive number. */
  maxOwed: number;
}

/**
 * Decides whether the chart may zoom the owed region. `zoomEnabled` is the user's
 * setting — off means never zoom. Even when on, zooming is only honest while
 * everything above the baseline stays on one scale, so any negative net worth or
 * assets value (which would also need the sub-scale) forces the shared scale.
 */
export const computeLiabilityScale = ({
  points,
  zoomEnabled = true,
}: {
  points: NetWorthDisplayPoint[];
  zoomEnabled?: boolean;
}): LiabilityScale => {
  let maxPositive = 0;
  let maxOwed = 0;
  let allAboveBaselineNonNegative = true;

  for (const point of points) {
    maxPositive = Math.max(maxPositive, point.assets, point.netWorth, point.liabilitiesTotal);
    if (point.liabilitiesTotal < 0) maxOwed = Math.max(maxOwed, -point.liabilitiesTotal);
    if (point.netWorth < 0 || point.assets < 0) allAboveBaselineNonNegative = false;
  }

  return {
    asymmetric:
      zoomEnabled &&
      maxOwed > 0 &&
      maxOwed < ASYMMETRIC_OWED_SHARE_THRESHOLD * maxPositive &&
      allAboveBaselineNonNegative,
    maxPositive,
    maxOwed,
  };
};

/**
 * Last minus first displayed net worth. The percentage is null when the first
 * point is zero — a ratio against nothing reads as noise, not a change.
 */
export const computePeriodChange = ({
  points,
}: {
  points: NetWorthDisplayPoint[];
}): { amount: number; pct: number | null } => {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return { amount: 0, pct: null };

  const amount = last.netWorth - first.netWorth;
  const pct = first.netWorth !== 0 ? (amount / Math.abs(first.netWorth)) * 100 : null;
  return { amount, pct };
};

/** Calendar buckets the range spans at a granularity — mirrors how the API buckets. */
export const countBuckets = ({
  from,
  to,
  granularity,
}: {
  from: Date;
  to: Date;
  granularity: endpointsTypes.NetWorthHistoryGranularity;
}): number => {
  switch (granularity) {
    case 'weekly':
      return differenceInCalendarISOWeeks(to, from) + 1;
    case 'monthly':
      return differenceInCalendarMonths(to, from) + 1;
    case 'quarterly':
      return differenceInCalendarQuarters(to, from) + 1;
    case 'yearly':
      return differenceInCalendarYears(to, from) + 1;
  }
};

/**
 * Default granularity for a range: fine enough to show shape, coarse enough that
 * every threshold stays comfortably under the backend's bucket cap.
 */
export const autoGranularity = ({ from, to }: { from: Date; to: Date }): endpointsTypes.NetWorthHistoryGranularity => {
  const days = differenceInCalendarDays(to, from) + 1;
  if (days <= 370) return 'weekly';
  if (days <= 1850) return 'monthly';
  return 'quarterly';
};

/** Granularities the current range would push past the backend's bucket cap. */
export const disabledGranularities = ({
  from,
  to,
}: {
  from: Date;
  to: Date;
}): endpointsTypes.NetWorthHistoryGranularity[] =>
  endpointsTypes.NET_WORTH_HISTORY_GRANULARITIES.filter(
    (granularity) => countBuckets({ from, to, granularity }) > MAX_NET_WORTH_HISTORY_BUCKETS,
  );
