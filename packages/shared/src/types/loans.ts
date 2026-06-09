/**
 * Append-only audit/timeline entries stored on `LoanDetails.events` (JSONB).
 * Reads with the loan record; not indexed independently. New event types can
 * be added without a schema migration — extend the union and a Zod validator.
 *
 * `at` is an ISO 8601 timestamp.
 * `rate_change.from/to` are APR percent (e.g. 3.75 for 3.75%).
 * `term_change.from/to` are months.
 * Money values in events are stored as cents to match the project's Money
 * convention; API consumers receive them via the same serializer pipeline.
 */
export type LoanEvent =
  | { type: 'rate_change'; at: string; from: number; to: number }
  | { type: 'term_change'; at: string; from: number; to: number; reason?: string }
  | { type: 'planned_payment_change'; at: string; fromCents: number; toCents: number }
  | { type: 'note'; at: string; text: string }
  | { type: 'paid_off'; at: string }
  | { type: 'refinanced'; at: string; replacedByLoanId: string };

export type LoanEventType = LoanEvent['type'];

/**
 * Why the projection's forward-looking metrics are unavailable. Surfaces in
 * the UI as a banner. Distinguishes "user hasn't told us how much they're
 * paying" from "what they're paying is mathematically too little".
 */
export type LoanProjectionWarning = 'no_planned_payment' | 'payment_below_interest';

/**
 * Output of the client-side projection. Optional fields are `null` when a
 * warning is set or when the loan is already paid off.
 *
 * All monetary values are decimals (number) to match the API decimal-in-API
 * convention; the backend serializer converts from cents before sending.
 */
export interface LoanProjection {
  /** ISO date (YYYY-MM-DD) when the loan would be paid off at the current trajectory. */
  payoffDate: string | null;
  monthsRemaining: number | null;
  /** Total interest still to be paid between now and payoff. */
  totalInterestRemaining: number | null;
  /** Cumulative principal paid down to date (originalPrincipal − currentBalance). */
  paidToDate: number;
  /** 0..100 — paidToDate / originalPrincipal × 100. */
  paidToDatePercent: number;
  /** Interest accruing on the current balance over the next month at the current APR. */
  monthlyInterest: number;
  /** plannedPayment − monthlyInterest. Null when plannedPayment is absent. */
  monthlyPrincipal: number | null;
  isPaidOff: boolean;
  warning: LoanProjectionWarning | null;
}
