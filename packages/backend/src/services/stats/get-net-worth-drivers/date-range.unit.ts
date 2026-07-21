import type { PeriodBucket } from '@services/stats/utils';

import { buildBoundaryDates, buildDenseDateRange } from './date-range';

const buildBucket = ({ start, end }: { start: string; end: string }): PeriodBucket => ({
  periodStart: new Date(`${start}T00:00:00.000`),
  periodEnd: new Date(`${end}T23:59:59.999`),
});

describe('buildBoundaryDates', () => {
  it('returns the day before the first bucket plus each bucket end', () => {
    const buckets = [
      buildBucket({ start: '2026-01-01', end: '2026-01-31' }),
      buildBucket({ start: '2026-02-01', end: '2026-02-28' }),
    ];

    expect(buildBoundaryDates({ buckets })).toEqual(['2025-12-31', '2026-01-31', '2026-02-28']);
  });

  it('produces one more snapshot than there are buckets, so buckets share their edges', () => {
    const buckets = Array.from({ length: 5 }, (_, index) =>
      buildBucket({ start: `2026-0${index + 1}-01`, end: `2026-0${index + 1}-28` }),
    );

    expect(buildBoundaryDates({ buckets })).toHaveLength(buckets.length + 1);
  });

  it('returns nothing for no buckets', () => {
    expect(buildBoundaryDates({ buckets: [] })).toEqual([]);
  });
});

describe('buildDenseDateRange', () => {
  it('fills every day between the first and last snapshot', () => {
    const dense = buildDenseDateRange({ boundaryDates: ['2026-01-30', '2026-02-02'] });

    expect(dense).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });

  it('returns nothing for no snapshots', () => {
    expect(buildDenseDateRange({ boundaryDates: [] })).toEqual([]);
  });
});
