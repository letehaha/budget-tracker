import { endpointsTypes } from '@bt/shared/types';
import { differenceInDays, endOfMonth, isSameMonth, parseISO, startOfMonth, subDays, subMonths } from 'date-fns';

export interface DatePeriod {
  from: Date;
  to: Date;
}

export interface TrendPeriod extends DatePeriod {
  isCurrent: boolean;
}

export interface CashFlowTotals {
  income: number;
  expenses: number;
  netFlow: number;
  // percentage (0-100)
  savingsRate: number;
}

// The trend bars show this many past periods before the current one.
const PREV_PERIOD_COUNT = 5;

/** True when the period spans exactly one whole calendar month. */
export function isFullMonthPeriod({ from, to }: DatePeriod): boolean {
  return isSameMonth(from, to) && from.getDate() === 1 && to.getDate() === endOfMonth(to).getDate();
}

/**
 * The period immediately before the selected one. For a whole month it's the
 * previous calendar month; otherwise it's the same-length window ending the day
 * before `from`.
 */
export function computePrevPeriod({ from, to }: DatePeriod): DatePeriod {
  if (isFullMonthPeriod({ from, to })) {
    const prev = subMonths(from, 1);
    return { from: startOfMonth(prev), to: endOfMonth(prev) };
  }

  const durationInDays = differenceInDays(to, from) + 1;
  return { from: subDays(from, durationInDays), to: subDays(from, 1) };
}

/**
 * The five periods preceding the selected one, plus the selected one itself
 * (flagged `isCurrent`), oldest first — the buckets behind the trend bars.
 */
export function computeTrendPeriods({ from, to }: DatePeriod): TrendPeriod[] {
  const durationInDays = differenceInDays(to, from) + 1;
  const fullMonth = isFullMonthPeriod({ from, to });

  const periods: TrendPeriod[] = [];

  for (let i = PREV_PERIOD_COUNT; i >= 1; i--) {
    if (fullMonth) {
      const periodFrom = startOfMonth(subMonths(from, i));
      periods.push({ from: periodFrom, to: endOfMonth(periodFrom), isCurrent: false });
    } else {
      const periodTo = subDays(from, (i - 1) * durationInDays + 1);
      const periodFrom = subDays(periodTo, durationInDays - 1);
      periods.push({ from: periodFrom, to: periodTo, isCurrent: false });
    }
  }

  // The selected period is the last (rightmost) bar.
  periods.push({ from, to, isCurrent: true });

  return periods;
}

/**
 * Aggregates the monthly buckets whose start falls inside [from, to] into a
 * single totals object.
 *
 * The cash-flow widget fetches one wide monthly span and slices the current and
 * previous months out of it instead of firing a request per month. This mirrors
 * the endpoint's own totals math (totals = sum of periods, savingsRate =
 * round(netFlow / income * 100)), so a slice of the wide response is identical
 * to a dedicated narrow-range call.
 *
 * Only valid for month-aligned ranges: a partial month can't be reconstructed
 * from a whole-month bucket, so callers fall back to a dedicated call there.
 */
export function sliceCashFlowTotals({
  periods,
  from,
  to,
}: {
  periods: endpointsTypes.CashFlowPeriodData[];
  from: Date;
  to: Date;
}): CashFlowTotals {
  const fromTime = from.getTime();
  const toTime = to.getTime();

  let income = 0;
  let expenses = 0;

  for (const period of periods) {
    const startTime = parseISO(period.periodStart).getTime();
    if (startTime >= fromTime && startTime <= toTime) {
      income += period.income;
      expenses += period.expenses;
    }
  }

  const netFlow = income - expenses;
  const savingsRate = income > 0 ? Math.round((netFlow / income) * 100) : 0;

  return { income, expenses, netFlow, savingsRate };
}
