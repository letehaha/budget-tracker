import type { LoanProjection } from '@bt/shared/types';
import { roundHalfToEven } from '@common/utils/round-half-to-even';

/**
 * Pure-function payoff projection for a loan. Deterministic — pass `today` as
 * a parameter so callers can fix the clock in tests and so the same module
 * runs identically on backend and (later) frontend.
 *
 * Math runs in cents to avoid floating-point drift; output values are decimals
 * (Number) so callers can hand the result straight to `res.json()` without
 * extra conversion.
 *
 * The standard closed-form amortization is used for non-zero APR:
 *
 *     n = ⌈ log( P / (P − B·r) ) / log(1 + r) ⌉
 *
 * where B = currentBalanceCents, P = plannedPaymentCents, r = APR / 100 / 12.
 *
 * A zero-APR loan is a degenerate case — the log formula divides by zero, so
 * months remaining collapses to ⌈B / P⌉ with no interest accrual.
 *
 * Banker's rounding (round-half-to-even) is used for the per-month interest
 * accrual so cumulative bias stays minimal across long-running mortgages.
 */
interface LoanProjectionInput {
  /** Outstanding balance the user owes, expressed as a positive integer in cents. */
  currentBalanceCents: number;
  /** Lender-issued principal at origination, in cents. */
  originalPrincipalCents: number;
  /** APR as percent, e.g. 3.75 for 3.75%. Must be in [0, 100). */
  interestRate: number;
  /** Planned monthly payment, in cents. `null` when the user hasn't set one. */
  plannedPaymentCents: number | null;
  /**
   * Reference "now" used to anchor `payoffDate`. Pass a Date instance or a
   * parseable date string. Injecting the clock keeps the function pure and the
   * unit tests deterministic.
   */
  today: Date | string;
}

const MONTHS_PER_YEAR = 12;

export function computeLoanProjection(input: LoanProjectionInput): LoanProjection {
  const { currentBalanceCents, originalPrincipalCents, interestRate, plannedPaymentCents } = input;
  const today = input.today instanceof Date ? input.today : new Date(input.today);

  const paidToDateCents = originalPrincipalCents - currentBalanceCents;
  const paidToDate = centsToDecimal(paidToDateCents);
  const paidToDatePercent = computePaidToDatePercent({ paidToDateCents, originalPrincipalCents });

  const isPaidOff = currentBalanceCents <= 0;

  if (isPaidOff) {
    return {
      payoffDate: null,
      monthsRemaining: 0,
      totalInterestRemaining: 0,
      paidToDate,
      paidToDatePercent,
      monthlyInterest: 0,
      monthlyPrincipal: null,
      isPaidOff: true,
      warning: null,
    };
  }

  const monthlyInterestCents = roundHalfToEven((currentBalanceCents * interestRate) / 100 / MONTHS_PER_YEAR);

  if (plannedPaymentCents === null) {
    return {
      payoffDate: null,
      monthsRemaining: null,
      totalInterestRemaining: null,
      paidToDate,
      paidToDatePercent,
      monthlyInterest: centsToDecimal(monthlyInterestCents),
      monthlyPrincipal: null,
      isPaidOff: false,
      warning: 'no_planned_payment',
    };
  }

  if (plannedPaymentCents <= monthlyInterestCents) {
    return {
      payoffDate: null,
      monthsRemaining: null,
      totalInterestRemaining: null,
      paidToDate,
      paidToDatePercent,
      monthlyInterest: centsToDecimal(monthlyInterestCents),
      monthlyPrincipal: centsToDecimal(plannedPaymentCents - monthlyInterestCents),
      isPaidOff: false,
      warning: 'payment_below_interest',
    };
  }

  const monthsRemaining = computeMonthsRemaining({
    currentBalanceCents,
    plannedPaymentCents,
    interestRate,
  });

  const totalInterestRemainingCents = plannedPaymentCents * monthsRemaining - currentBalanceCents;

  return {
    payoffDate: addMonthsIso({ from: today, months: monthsRemaining }),
    monthsRemaining,
    totalInterestRemaining: centsToDecimal(totalInterestRemainingCents),
    paidToDate,
    paidToDatePercent,
    monthlyInterest: centsToDecimal(monthlyInterestCents),
    monthlyPrincipal: centsToDecimal(plannedPaymentCents - monthlyInterestCents),
    isPaidOff: false,
    warning: null,
  };
}

function computeMonthsRemaining({
  currentBalanceCents,
  plannedPaymentCents,
  interestRate,
}: {
  currentBalanceCents: number;
  plannedPaymentCents: number;
  interestRate: number;
}): number {
  if (interestRate === 0) {
    return Math.ceil(currentBalanceCents / plannedPaymentCents);
  }
  const monthlyRate = interestRate / 100 / MONTHS_PER_YEAR;
  const numerator = Math.log(plannedPaymentCents / (plannedPaymentCents - currentBalanceCents * monthlyRate));
  const denominator = Math.log(1 + monthlyRate);
  return Math.ceil(numerator / denominator);
}

function computePaidToDatePercent({
  paidToDateCents,
  originalPrincipalCents,
}: {
  paidToDateCents: number;
  originalPrincipalCents: number;
}): number {
  if (originalPrincipalCents <= 0) return 0;
  const raw = (paidToDateCents / originalPrincipalCents) * 100;
  const clamped = Math.max(0, Math.min(100, raw));
  return Math.round(clamped * 10) / 10;
}

function centsToDecimal(cents: number): number {
  return cents / 100;
}

function addMonthsIso({ from, months }: { from: Date; months: number }): string {
  const result = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  const yyyy = result.getFullYear();
  const mm = String(result.getMonth() + 1).padStart(2, '0');
  const dd = String(result.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
