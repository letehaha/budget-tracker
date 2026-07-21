import type { PeriodBucket } from '@services/stats/utils';
import { eachDayOfInterval, format, parseISO, subDays } from 'date-fns';

/**
 * Snapshot days that bracket every bucket: the day before the first bucket
 * opens, then each bucket's last day.
 *
 * Buckets are contiguous, so entry `i` is bucket `i`'s opening snapshot and
 * entry `i + 1` its closing one — n buckets need n+1 snapshots, not 2n. Holdings
 * are valued only on these days rather than daily, which is what keeps the
 * replay cheap over a multi-year range.
 */
export const buildBoundaryDates = ({ buckets }: { buckets: PeriodBucket[] }): string[] => {
  if (buckets.length === 0) return [];

  const dates = [format(subDays(buckets[0]!.periodStart, 1), 'yyyy-MM-dd')];
  for (const bucket of buckets) {
    dates.push(format(bucket.periodEnd, 'yyyy-MM-dd'));
  }

  return dates;
};

/**
 * Dense day list spanning the snapshot range. `computePortfolioCashByDate` and
 * `getAggregatedBalanceHistory` both replay day-by-day and read wrong on a
 * sparse list, so they get every day and the caller picks the boundaries back
 * out. Holdings, which fold a cursor forward, take the sparse list directly.
 */
export const buildDenseDateRange = ({ boundaryDates }: { boundaryDates: string[] }): string[] => {
  if (boundaryDates.length === 0) return [];

  return eachDayOfInterval({
    start: parseISO(boundaryDates[0]!),
    end: parseISO(boundaryDates[boundaryDates.length - 1]!),
  }).map((date) => format(date, 'yyyy-MM-dd'));
};
