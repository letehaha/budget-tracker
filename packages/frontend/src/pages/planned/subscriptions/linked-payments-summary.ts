import { format } from 'date-fns';

/** Fallback bar height when every refAmount is zero, so the chart still renders bars. */
const MIN_BAR_HEIGHT_PCT = 8;

/**
 * Bars scale across the min–max refAmount range (sparkline-style), not from a zero
 * baseline: recurring payments cluster tightly, and a zero baseline renders them as a
 * flat wall that hides the drift the chart exists to show.
 */
const BAR_RANGE_FLOOR_PCT = 30;

/** Below this, a first-vs-latest comparison describes noise rather than a trend. */
const MIN_PAYMENTS_FOR_DRIFT = 3;

/** Shape the summary reads off a linked transaction; callers keep their own richer type. */
export interface LinkedPaymentLike {
  id: string;
  amount: number;
  refAmount: number;
  currencyCode: string;
  refCurrencyCode: string;
  time: Date | string;
}

export interface LinkedPaymentsCurrencyTotal {
  currencyCode: string;
  total: number;
}

export interface LinkedPaymentsYearGroup<T> {
  year: number;
  payments: T[];
  totalsByCurrency: LinkedPaymentsCurrencyTotal[];
}

export interface LinkedPaymentsChartBar {
  id: string;
  heightPct: number;
  monthLabel: string;
  amount: number;
  currencyCode: string;
  refAmount: number;
  refCurrencyCode: string;
  isLatest: boolean;
}

export interface LinkedPaymentsDrift {
  percent: number;
  direction: 'up' | 'down';
  firstPaymentTime: Date;
}

export interface LinkedPaymentsAverage {
  amount: number;
  currencyCode: string;
}

export interface LinkedPaymentsStats {
  totalsByCurrency: LinkedPaymentsCurrencyTotal[];
  /**
   * Mean over payments booked in the dominant currency only. A refAmount mean would
   * surface the user's base currency, which reads disconnected next to the native totals.
   */
  average: LinkedPaymentsAverage | null;
  lastPaymentTime: Date | null;
}

export interface LinkedPaymentsSummary<T> {
  payments: T[];
  yearGroups: LinkedPaymentsYearGroup<T>[];
  stats: LinkedPaymentsStats;
  chart: LinkedPaymentsChartBar[];
  drift: LinkedPaymentsDrift | null;
}

const toDate = ({ time }: { time: Date | string }): Date => (time instanceof Date ? time : new Date(time));

/** Dominant currency first: the code the most payments were booked in leads the list. */
const sumByCurrency = <T extends LinkedPaymentLike>({ payments }: { payments: T[] }): LinkedPaymentsCurrencyTotal[] => {
  const buckets = new Map<string, { total: number; count: number }>();

  for (const payment of payments) {
    const bucket = buckets.get(payment.currencyCode) ?? { total: 0, count: 0 };
    bucket.total += payment.amount;
    bucket.count += 1;
    buckets.set(payment.currencyCode, bucket);
  }

  return [...buckets.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([currencyCode, { total }]) => ({ currencyCode, total }));
};

const buildDrift = <T extends LinkedPaymentLike>({
  first,
  latest,
  paymentsCount,
}: {
  first: T | undefined;
  latest: T | undefined;
  paymentsCount: number;
}): LinkedPaymentsDrift | null => {
  if (!first || !latest || paymentsCount < MIN_PAYMENTS_FOR_DRIFT || first.refAmount === 0) return null;

  const percent = Math.round(((latest.refAmount - first.refAmount) / first.refAmount) * 100);
  if (percent === 0) return null;

  return {
    percent: Math.abs(percent),
    direction: percent > 0 ? 'up' : 'down',
    firstPaymentTime: toDate({ time: first.time }),
  };
};

/**
 * Everything the linked-payments UI renders, derived in one pass: the ledger
 * (newest-first, grouped by year), the headline stats, the amount chart and the
 * price drift. Chart heights and drift compare `refAmount`, so payments booked in
 * different currencies stay comparable.
 */
export const buildLinkedPaymentsSummary = <T extends LinkedPaymentLike>({
  transactions,
}: {
  transactions: T[];
}): LinkedPaymentsSummary<T> => {
  const payments = [...transactions].sort(
    (a, b) => toDate({ time: b.time }).getTime() - toDate({ time: a.time }).getTime(),
  );
  const oldestFirst = [...payments].reverse();

  const yearBuckets = new Map<number, T[]>();
  for (const payment of payments) {
    const year = toDate({ time: payment.time }).getFullYear();
    const bucket = yearBuckets.get(year);
    if (bucket) {
      bucket.push(payment);
    } else {
      yearBuckets.set(year, [payment]);
    }
  }

  const yearGroups = [...yearBuckets.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, yearPayments]) => ({
      year,
      payments: yearPayments,
      totalsByCurrency: sumByCurrency({ payments: yearPayments }),
    }));

  const latest = payments[0];
  const refAmounts = payments.map((payment) => payment.refAmount);
  const maxRefAmount = Math.max(0, ...refAmounts);
  const minRefAmount = refAmounts.length ? Math.min(...refAmounts) : 0;
  const refRange = maxRefAmount - minRefAmount;

  const barHeightPct = ({ refAmount }: { refAmount: number }): number => {
    if (maxRefAmount === 0) return MIN_BAR_HEIGHT_PCT;
    if (refRange === 0) return 100;
    return BAR_RANGE_FLOOR_PCT + ((refAmount - minRefAmount) / refRange) * (100 - BAR_RANGE_FLOOR_PCT);
  };

  const chart = oldestFirst.map((payment, index) => ({
    id: payment.id,
    heightPct: barHeightPct({ refAmount: payment.refAmount }),
    monthLabel: format(toDate({ time: payment.time }), 'MMM yy'),
    amount: payment.amount,
    currencyCode: payment.currencyCode,
    refAmount: payment.refAmount,
    refCurrencyCode: payment.refCurrencyCode,
    isLatest: index === oldestFirst.length - 1,
  }));

  const totalsByCurrency = sumByCurrency({ payments });
  const dominant = totalsByCurrency[0];
  const dominantCount = dominant
    ? payments.filter((payment) => payment.currencyCode === dominant.currencyCode).length
    : 0;

  return {
    payments,
    yearGroups,
    stats: {
      totalsByCurrency,
      average: dominant ? { amount: dominant.total / dominantCount, currencyCode: dominant.currencyCode } : null,
      lastPaymentTime: latest ? toDate({ time: latest.time }) : null,
    },
    chart,
    drift: buildDrift({ first: oldestFirst[0], latest, paymentsCount: payments.length }),
  };
};
