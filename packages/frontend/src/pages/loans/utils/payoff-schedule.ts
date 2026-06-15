import { addMonths } from 'date-fns';

/**
 * Client-side amortization for the payoff-projection chart. The backend's
 * `computeLoanProjection` only returns summary numbers (no per-month series),
 * and the chart needs to recompute instantly as the user types a custom
 * payment — so the month-by-month schedule is generated here.
 *
 * The headline figures (`monthsRemaining`, `payoffDate`, `totalInterest`) use
 * the exact same closed-form formulas as the backend so the planned scenario's
 * numbers line up to the penny with the Projection card. The balance series is
 * a faithful amortization curve drawn under those figures.
 *
 * Monetary inputs/outputs are decimals (the frontend's convention); the
 * iteration runs in integer cents internally to avoid floating-point drift and
 * to match the backend's banker's-rounded interest accrual.
 */

/** 100-year horizon cap, matching the backend loan-term cap. A payment too small
 * to clear the balance within this window does not amortize within any
 * representable date range and is reported as "never pays off". */
const MAX_PROJECTION_MONTHS = 1200;
const MONTHS_PER_YEAR = 12;

/**
 * Round-half-to-even (banker's rounding) to the nearest integer. Mirrors the
 * backend's per-month interest accrual so cumulative rounding bias stays
 * minimal across long mortgages and the payoff month matches the card.
 */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  // Exactly halfway — round to the even neighbour.
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Fixed monthly payment that fully amortizes `principal` over `termMonths` at
 * the given APR — the contractual "minimum payment" of a level-payment loan.
 * Returned as a decimal rounded to the cent, or `null` when there's no term to
 * derive it from.
 */
export function computeMinimumPaymentFromTerm({
  principal,
  interestRate,
  termMonths,
}: {
  principal: number;
  /** APR as percent, e.g. 6 for 6%. */
  interestRate: number;
  termMonths: number | null;
}): number | null {
  if (!termMonths || termMonths <= 0 || principal <= 0) return null;

  if (interestRate === 0) {
    return Math.round((principal / termMonths) * 100) / 100;
  }

  const monthlyRate = interestRate / 100 / MONTHS_PER_YEAR;
  const payment = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  // Round half-up to the cent — conventional for a displayed payment amount. (This
  // differs from the half-to-even rounding used for interest accrual below, which
  // exists only to mirror the backend's per-month rounding.)
  return Math.round(payment * 100) / 100;
}

export interface PayoffPoint {
  /** Months from today (0 = today). */
  month: number;
  date: Date;
  /** Outstanding balance at month end, decimal in the loan's currency. */
  balance: number;
}

export interface PayoffScenario {
  /** False when the payment can't cover monthly interest or the loan outlasts the horizon. */
  paysOff: boolean;
  monthsRemaining: number | null;
  payoffDate: Date | null;
  /** Total interest paid between now and payoff, decimal. Null when it never pays off. */
  totalInterest: number | null;
  /** Month-by-month balance series for the chart, starting at month 0 (today). */
  points: PayoffPoint[];
}

/**
 * Closed-form months-to-payoff — identical to the backend formula so the
 * planned scenario matches the Projection card exactly.
 *
 *     n = ⌈ log( P / (P − B·r) ) / log(1 + r) ⌉
 */
function computeMonthsRemaining({
  balanceCents,
  paymentCents,
  interestRate,
}: {
  balanceCents: number;
  paymentCents: number;
  interestRate: number;
}): number {
  if (interestRate === 0) {
    return Math.ceil(balanceCents / paymentCents);
  }
  const monthlyRate = interestRate / 100 / MONTHS_PER_YEAR;
  const numerator = Math.log(paymentCents / (paymentCents - balanceCents * monthlyRate));
  const denominator = Math.log(1 + monthlyRate);
  return Math.ceil(numerator / denominator);
}

/**
 * Project a single fixed-payment scenario into a month-by-month payoff series.
 *
 * @param balance Outstanding balance owed, as a positive decimal.
 * @param interestRate APR as percent (e.g. 6 for 6%).
 * @param payment Fixed monthly payment, decimal.
 * @param today Reference "now" anchoring the dates — injected so the function
 *   stays pure and unit-testable.
 */
export function computePayoffScenario({
  balance,
  interestRate,
  payment,
  today,
}: {
  balance: number;
  interestRate: number;
  payment: number;
  today: Date;
}): PayoffScenario {
  const balanceCents = Math.round(balance * 100);
  const paymentCents = Math.round(payment * 100);

  const neverPaysOff: PayoffScenario = {
    paysOff: false,
    monthsRemaining: null,
    payoffDate: null,
    totalInterest: null,
    points: [{ month: 0, date: today, balance: Math.max(0, balanceCents) / 100 }],
  };

  if (balanceCents <= 0) {
    return {
      paysOff: true,
      monthsRemaining: 0,
      payoffDate: today,
      totalInterest: 0,
      points: [{ month: 0, date: today, balance: 0 }],
    };
  }

  if (paymentCents <= 0) return neverPaysOff;

  const monthlyInterestCents = roundHalfToEven((balanceCents * interestRate) / 100 / MONTHS_PER_YEAR);
  // A payment that cannot cover the monthly interest never reduces principal.
  if (paymentCents <= monthlyInterestCents) return neverPaysOff;

  const monthsRemaining = computeMonthsRemaining({ balanceCents, paymentCents, interestRate });
  if (!Number.isFinite(monthsRemaining) || monthsRemaining <= 0 || monthsRemaining > MAX_PROJECTION_MONTHS) {
    return neverPaysOff;
  }

  const totalInterestCents = paymentCents * monthsRemaining - balanceCents;

  const points: PayoffPoint[] = [{ month: 0, date: today, balance: balanceCents / 100 }];
  let runningCents = balanceCents;
  for (let month = 1; month <= monthsRemaining; month += 1) {
    const interestCents = roundHalfToEven((Math.max(0, runningCents) * interestRate) / 100 / MONTHS_PER_YEAR);
    runningCents = runningCents + interestCents - paymentCents;
    // The closed-form month count is authoritative; force the final point to
    // zero so the curve lands exactly on the payoff marker and absorbs the
    // sub-cent rounding remainder into the last payment.
    const displayCents = month === monthsRemaining ? 0 : Math.max(0, runningCents);
    points.push({ month, date: addMonths(today, month), balance: displayCents / 100 });
  }

  return {
    paysOff: true,
    monthsRemaining,
    payoffDate: addMonths(today, monthsRemaining),
    totalInterest: totalInterestCents / 100,
    points,
  };
}

/** Below this absolute interest delta (decimal currency units), two scenarios read as "the same" interest. */
export const SAME_INTEREST_EPSILON = 0.005;

export interface PayoffComparison {
  /** scenario.totalInterest − baseline.totalInterest (decimal). Negative = scenario saves interest. */
  interestDelta: number;
  /** scenario.monthsRemaining − baseline.monthsRemaining. Negative = scenario pays off sooner. */
  monthsDelta: number;
  sameInterest: boolean;
  sameTime: boolean;
  savesInterest: boolean;
  costsInterest: boolean;
  faster: boolean;
  slower: boolean;
}

/**
 * Compare a payoff scenario against a baseline scenario (the planned payment).
 * Precondition: both pay off with non-null totalInterest & monthsRemaining — the
 * caller guards this; missing figures are treated as 0 defensively.
 */
export function comparePayoffScenarios({
  scenario,
  baseline,
}: {
  scenario: PayoffScenario;
  baseline: PayoffScenario;
}): PayoffComparison {
  const interestDelta = (scenario.totalInterest ?? 0) - (baseline.totalInterest ?? 0);
  const monthsDelta = (scenario.monthsRemaining ?? 0) - (baseline.monthsRemaining ?? 0);
  const sameInterest = Math.abs(interestDelta) < SAME_INTEREST_EPSILON;
  const sameTime = monthsDelta === 0;
  return {
    interestDelta,
    monthsDelta,
    sameInterest,
    sameTime,
    savesInterest: !sameInterest && interestDelta < 0,
    costsInterest: !sameInterest && interestDelta > 0,
    faster: !sameTime && monthsDelta < 0,
    slower: !sameTime && monthsDelta > 0,
  };
}
