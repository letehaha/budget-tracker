import type { LoanProjection } from '@bt/shared/types';
import { centsToApiDecimal } from '@common/types/money';
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
 * A planned payment of `0` is treated identically to `null`: it expresses the
 * absence of a plan, not an underfunded one, and yields `no_planned_payment`.
 *
 * Both amortization paths are capped at `MAX_PROJECTION_MONTHS`. A payment that
 * is positive yet so small the loan would take longer than that to clear (e.g.
 * a six-figure balance paid a cent a month) does not amortize within any horizon
 * a Date can represent; it returns the `payment_below_interest` shape rather than
 * overflowing into an unrepresentable payoff date.
 *
 * Banker's rounding (round-half-to-even) is used for the per-month interest
 * accrual so cumulative bias stays minimal across long-running mortgages.
 */
interface LoanProjectionInput {
  /**
   * Outstanding balance the user owes, expressed as a non-negative integer in
   * cents. Zero (a loan created with nothing outstanding, or fully paid down)
   * projects as `isPaidOff: true`.
   */
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

/**
 * Upper bound on a projectable payoff horizon, in months (100 years — matching
 * the loan-term cap). A payment that would take longer than this to clear the
 * balance is treated as never amortizing within a representable horizon.
 */
const MAX_PROJECTION_MONTHS = 1200;

export function computeLoanProjection(input: LoanProjectionInput): LoanProjection {
  const { currentBalanceCents, originalPrincipalCents, interestRate } = input;
  // A zero planned payment is the absence of a plan, not an underfunded one;
  // normalize it to null so it takes the `no_planned_payment` branch below
  // rather than falling through to the `payment_below_interest` check.
  const plannedPaymentCents = input.plannedPaymentCents === 0 ? null : input.plannedPaymentCents;
  const today = input.today instanceof Date ? input.today : new Date(input.today);

  // Outstanding above the original principal (negative amortization, or a
  // correction that raised the balance) would make principal-paid negative.
  // Floor it at zero so the UI reads "0 paid" instead of a nonsensical negative
  // "paid" amount; the percent is derived from the same floored value.
  const paidToDateCents = Math.max(0, originalPrincipalCents - currentBalanceCents);
  const paidToDate = centsToApiDecimal(paidToDateCents);
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
      monthlyInterest: centsToApiDecimal(monthlyInterestCents),
      monthlyPrincipal: null,
      isPaidOff: false,
      warning: 'no_planned_payment',
    };
  }

  // A payment that cannot cover the monthly interest accrual never reduces the
  // principal. Equality counts as below — no principal would be paid down.
  const paymentBelowInterest = {
    payoffDate: null,
    monthsRemaining: null,
    totalInterestRemaining: null,
    paidToDate,
    paidToDatePercent,
    monthlyInterest: centsToApiDecimal(monthlyInterestCents),
    monthlyPrincipal: centsToApiDecimal(plannedPaymentCents - monthlyInterestCents),
    isPaidOff: false,
    warning: 'payment_below_interest',
  } as const;

  if (plannedPaymentCents <= monthlyInterestCents) {
    return paymentBelowInterest;
  }

  const monthsRemaining = computeMonthsRemaining({
    currentBalanceCents,
    plannedPaymentCents,
    interestRate,
  });

  // A payment that is positive yet so small the loan outlasts the projectable
  // horizon (e.g. a zero-APR balance paid a cent a month) does not amortize
  // within any representable date range, so it reports the same way an
  // underfunded payment does.
  if (monthsRemaining > MAX_PROJECTION_MONTHS) {
    return paymentBelowInterest;
  }

  const totalInterestRemainingCents = plannedPaymentCents * monthsRemaining - currentBalanceCents;

  return {
    payoffDate: addMonthsIso({ from: today, months: monthsRemaining }),
    monthsRemaining,
    totalInterestRemaining: centsToApiDecimal(totalInterestRemainingCents),
    paidToDate,
    paidToDatePercent,
    monthlyInterest: centsToApiDecimal(monthlyInterestCents),
    monthlyPrincipal: centsToApiDecimal(plannedPaymentCents - monthlyInterestCents),
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

function addMonthsIso({ from, months }: { from: Date; months: number }): string {
  // Clamp to the last day of the target month instead of letting the Date
  // constructor normalize the overflow — Jan 31 + 1 month must land on
  // Feb 28/29, not Mar 2/3, to match "same day next month" payment-schedule
  // semantics for days 29–31.
  const targetMonth = from.getMonth() + months;
  const lastDayOfTargetMonth = new Date(from.getFullYear(), targetMonth + 1, 0).getDate();
  const result = new Date(from.getFullYear(), targetMonth, Math.min(from.getDate(), lastDayOfTargetMonth));
  if (!Number.isFinite(result.getTime())) {
    // An unrepresentable date here means `months` was never bounded before this
    // call — a caller-side bug. Surface it instead of serializing "NaN-NaN-NaN".
    throw new Error(`addMonthsIso produced an invalid date from ${months} months`);
  }
  const yyyy = result.getFullYear();
  const mm = String(result.getMonth() + 1).padStart(2, '0');
  const dd = String(result.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
