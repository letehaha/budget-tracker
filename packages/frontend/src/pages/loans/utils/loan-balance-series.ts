import { addMonths, differenceInCalendarMonths, isAfter, parseISO } from 'date-fns';

import type { PayoffPoint } from './payoff-schedule';

/**
 * Reshapes raw account balance history into the month-by-month series the
 * balance-journey chart draws, so the actual line shares the payoff chart's
 * month-indexed hover with the amortization-schedule line. Balance records are
 * signed (liabilities negative); the chart plots the outstanding magnitude.
 */

export interface BalanceHistoryPoint {
  /** yyyy-MM-dd */
  date: string;
  /** Signed balance, decimal in the loan's currency (liabilities are negative). */
  amount: number;
}

/**
 * Resample per-record balance history onto a monthly grid anchored at
 * `startDate`. Each month takes the abs of the latest record dated on or before
 * that month; months before the first record fall back to `originalPrincipal`.
 * The final month is forced to 0 so the curve lands on the "$0" payoff marker.
 * Always returns a drawable series (≥2 points, principal → 0): a loan opened
 * and closed within one calendar month is below the grid's resolution, so it
 * gets the guaranteed shape padded to one month of horizontal extent.
 */
export function buildActualBalanceSeries({
  history,
  startDate,
  closedDate,
  originalPrincipal,
}: {
  history: BalanceHistoryPoint[];
  startDate: Date;
  closedDate: Date;
  originalPrincipal: number;
}): PayoffPoint[] {
  const totalMonths = Math.max(0, differenceInCalendarMonths(closedDate, startDate));

  if (totalMonths === 0) {
    // Same-month open→close (e.g. a loan recorded and repaid the same day):
    // intermediate history can't refine a sub-month span, so emit the
    // principal→0 shape directly. The zero point sits one month out purely for
    // drawable width — the chart's marker label still shows the true close
    // date via `displayPayoffDate`.
    return [
      { month: 0, date: startDate, balance: originalPrincipal },
      { month: 1, date: addMonths(startDate, 1), balance: 0 },
    ];
  }

  // Ascending order turns the "latest record on or before this month" lookup into a single forward walk.
  const sorted = history
    .map((entry) => ({ date: parseISO(entry.date), balance: Math.abs(entry.amount) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const points: PayoffPoint[] = [];
  let cursor = 0;
  let lastKnown = originalPrincipal;

  for (let month = 0; month <= totalMonths; month += 1) {
    const monthDate = addMonths(startDate, month);
    while (cursor < sorted.length && !isAfter(sorted[cursor]!.date, monthDate)) {
      lastKnown = sorted[cursor]!.balance;
      cursor += 1;
    }
    points.push({ month, date: monthDate, balance: month === totalMonths ? 0 : lastKnown });
  }

  return points;
}
