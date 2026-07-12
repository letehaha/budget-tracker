import type { LoanBalanceHistoryPoint } from '@/api/loans';
import { addMonths, differenceInCalendarMonths, isAfter, parseISO } from 'date-fns';

import { outstandingAmount } from './outstanding-amount';
import type { PayoffPoint } from './payoff-schedule';

/**
 * Reshapes raw loan balance history into the month-by-month series the
 * balance-journey chart draws, so the actual line shares the payoff chart's
 * month-indexed hover with the amortization-schedule line. Balance records are
 * signed (liabilities negative) and denominated in the loan's currency; the
 * chart plots the outstanding magnitude.
 */

/**
 * Resample per-record balance history onto a monthly grid anchored at
 * `startDate`. Each month takes the outstanding magnitude of the latest record
 * dated on or before that month; months before the first record fall back to
 * `openingBalance` — the loan's opening tracked balance, which is where the
 * recorded history starts (it can differ from the original principal when the
 * loan was entered mid-life). The final month is forced to 0 so the curve lands
 * on the "$0" payoff marker. Always returns a drawable series (≥2 points,
 * opening balance → 0): a loan opened and closed within one calendar month is
 * below the grid's resolution, so it gets the guaranteed shape padded to one
 * month of horizontal extent. All values are in the loan's currency.
 */
export function buildActualBalanceSeries({
  history,
  startDate,
  closedDate,
  openingBalance,
}: {
  history: LoanBalanceHistoryPoint[];
  startDate: Date;
  closedDate: Date;
  /** Positive outstanding magnitude of the loan's opening tracked balance, in the loan's currency. */
  openingBalance: number;
}): PayoffPoint[] {
  const totalMonths = Math.max(0, differenceInCalendarMonths(closedDate, startDate));

  if (totalMonths === 0) {
    // Same-month open→close (e.g. a loan recorded and repaid the same day):
    // intermediate history can't refine a sub-month span, so emit the
    // opening-balance→0 shape directly. The zero point sits one month out
    // purely for drawable width — the chart's marker label still shows the true
    // close date via `displayPayoffDate`.
    return [
      { month: 0, date: startDate, balance: openingBalance },
      { month: 1, date: addMonths(startDate, 1), balance: 0 },
    ];
  }

  // Ascending order turns the "latest record on or before this month" lookup into a single forward walk.
  const sorted = history
    .map((entry) => ({ date: parseISO(entry.date), balance: outstandingAmount({ balance: entry.amount }) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const points: PayoffPoint[] = [];
  let cursor = 0;
  let lastKnown = openingBalance;

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
