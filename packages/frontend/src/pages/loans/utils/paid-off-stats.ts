import { addMonths, differenceInCalendarMonths } from 'date-fns';

/**
 * Pure helpers for the paid-off ("settled") loan detail state: how long the loan
 * ran, how far ahead of its contractual term it closed, and how its total cost
 * splits between principal and estimated interest. All monetary inputs are
 * decimals in the loan's currency; callers render the returned numbers through
 * i18n so no user-facing text is produced here.
 */

const MONTHS_PER_YEAR = 12;
const CENTS_PER_UNIT = 100;

export interface LoanDurationParts {
  /** Whole calendar months the loan was open, floored at 0. */
  totalMonths: number;
  years: number;
  /** Remaining months after whole years (0..11). */
  months: number;
}

/** Whole-month span between the open and close dates, split into years + months. */
export function getLoanDurationParts({ start, end }: { start: Date; end: Date }): LoanDurationParts {
  const totalMonths = Math.max(0, differenceInCalendarMonths(end, start));
  return {
    totalMonths,
    years: Math.floor(totalMonths / MONTHS_PER_YEAR),
    months: totalMonths % MONTHS_PER_YEAR,
  };
}

/**
 * Months the loan closed ahead of its contractual end (startDate + termMonths).
 * Null when the loan has no term; 0 when it closed on or after schedule.
 */
export function getMonthsEarly({
  startDate,
  termMonths,
  closedDate,
}: {
  startDate: Date;
  termMonths: number | null;
  closedDate: Date;
}): number | null {
  if (termMonths == null || termMonths <= 0) return null;
  const scheduledEnd = addMonths(startDate, termMonths);
  const early = differenceInCalendarMonths(scheduledEnd, closedDate);
  return early > 0 ? early : 0;
}

export interface LoanCostSplit {
  /** principal + interest — the "total this loan cost" figure. */
  total: number;
  principal: number;
  interest: number;
  /** True only when there is a positive estimated interest figure to show. */
  hasInterest: boolean;
  /** 0..100 — principal's share of total (100 when the total is 0). */
  principalPercent: number;
  /** 0..100 — interest's share of total. */
  interestPercent: number;
  /**
   * Cents of interest paid per $1 borrowed (estimatedInterest / principal × 100),
   * rounded. Null when there is no interest or no principal to divide by.
   */
  interestPerDollarCents: number | null;
}

/**
 * Split a paid-off loan's total cost into principal vs. estimated interest.
 * `estimatedInterest` is null when the backend could not estimate it (no term);
 * the total then collapses to principal only.
 */
export function getLoanCostSplit({
  principal,
  estimatedInterest,
}: {
  principal: number;
  estimatedInterest: number | null;
}): LoanCostSplit {
  const hasInterest = estimatedInterest != null && estimatedInterest > 0;
  const interest = hasInterest ? estimatedInterest : 0;
  const total = principal + interest;
  const principalPercent = total > 0 ? (principal / total) * 100 : 100;
  const interestPercent = total > 0 ? (interest / total) * 100 : 0;
  const interestPerDollarCents =
    hasInterest && principal > 0 ? Math.round((interest / principal) * CENTS_PER_UNIT) : null;

  return {
    total,
    principal,
    interest,
    hasInterest,
    principalPercent,
    interestPercent,
    interestPerDollarCents,
  };
}
