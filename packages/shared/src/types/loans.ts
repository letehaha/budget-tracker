/**
 * Append-only audit/timeline entries on `LoanDetails.events` (JSONB) — new
 * event types need only a union + Zod extension, no migration. `at` is ISO
 * 8601; rate values are APR percent; `null` from/to means "not set". Money
 * fields are cents at rest — the API serializer converts to decimals (see
 * `LoanEventApi`). `balance_correction` records a manual outstanding edit
 * (positive amounts) that bypasses the payment flow.
 */
export type LoanEvent =
  | { type: 'rate_change'; at: string; from: number; to: number }
  | { type: 'term_change'; at: string; from: number | null; to: number | null; reason?: string }
  | { type: 'planned_payment_change'; at: string; fromCents: number | null; toCents: number | null }
  | { type: 'balance_correction'; at: string; fromCents: number; toCents: number }
  | { type: 'note'; at: string; text: string }
  | { type: 'paid_off'; at: string };

export type LoanEventType = LoanEvent['type'];

/**
 * Wire shape of `LoanEvent`: same union, but monetary fields are decimals named
 * `from`/`to` per the decimals-in-API convention.
 */
export type LoanEventApi =
  | { type: 'rate_change'; at: string; from: number; to: number }
  | { type: 'term_change'; at: string; from: number | null; to: number | null; reason?: string }
  | { type: 'planned_payment_change'; at: string; from: number | null; to: number | null }
  | { type: 'balance_correction'; at: string; from: number; to: number }
  | { type: 'note'; at: string; text: string }
  | { type: 'paid_off'; at: string };

/**
 * Why forward-looking projection metrics are unavailable: no planned payment
 * set vs. a payment mathematically too small to amortize.
 */
export type LoanProjectionWarning = 'no_planned_payment' | 'payment_below_interest';

/**
 * Nullable fields are `null` when a warning is set or the loan is paid off.
 * All monetary values are decimals per the decimals-in-API convention.
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
  /** plannedPayment − monthlyInterest. Null when plannedPayment is absent or below monthly interest. */
  monthlyPrincipal: number | null;
  isPaidOff: boolean;
  warning: LoanProjectionWarning | null;
}
