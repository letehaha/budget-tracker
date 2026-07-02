import { addMonths } from 'date-fns';

/**
 * Client-side amortization for the payoff-projection chart: the backend's
 * `computeLoanProjection` returns only summary numbers, and the chart needs a
 * per-month series that recomputes instantly as the user types. Must stay in
 * lockstep with `computeLoanProjection` so the chart matches the Projection
 * card to the cent. Monetary inputs/outputs are decimals; iteration runs in
 * integer cents internally.
 */

/** Payoff-horizon cap in months (100 years, matching the backend loan-term cap). */
const MAX_PROJECTION_MONTHS = 1200;
const MONTHS_PER_YEAR = 12;

/** Banker's rounding — mirrors the backend's per-month interest accrual. */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  // Exactly halfway — round to the even neighbour.
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Fixed monthly payment that fully amortizes `principal` over `termMonths` —
 * the contractual minimum of a level-payment loan. Null when there is no term.
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
  // Half-up to the cent (displayed-payment convention) — unlike the half-to-even
  // interest accrual, which must mirror the backend.
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

/** Closed-form months-to-payoff: n = ⌈log(P / (P − B·r)) / log(1 + r)⌉ — identical to the backend formula. */
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
 * Project a fixed-payment scenario into a month-by-month payoff series.
 * Decimals in; `today` is injected so the function stays pure.
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

  // Accumulated month by month (closed-form would overstate: the final month pays
  // only the leftover balance plus its interest). Same accrual as the backend's
  // `computeLoanProjection`, so the figure matches the Projection card to the cent.
  let totalInterestCents = 0;

  const points: PayoffPoint[] = [{ month: 0, date: today, balance: balanceCents / 100 }];
  let runningCents = balanceCents;
  for (let month = 1; month <= monthsRemaining; month += 1) {
    const interestCents = roundHalfToEven((Math.max(0, runningCents) * interestRate) / 100 / MONTHS_PER_YEAR);
    totalInterestCents += interestCents;
    // The last payment clears whatever is left instead of a full planned payment.
    runningCents = Math.max(0, runningCents + interestCents - paymentCents);
    // Force the final point to zero so the curve lands exactly on the payoff
    // marker; the sub-cent rounding remainder is absorbed into the last payment.
    const displayCents = month === monthsRemaining ? 0 : runningCents;
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
 * Compare a payoff scenario against the planned-payment baseline. Caller
 * ensures both pay off; missing figures fall back to 0.
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
