import type { LoanApi } from '@/api/loans';

import { outstandingAmount } from './outstanding-amount';

/** Injected live-FX converter; returns null when a required rate is unavailable. */
type ConvertFn = (params: { amount: number; from: string; to: string }) => number | null;

/** A settled loan carries no live debt and must not weigh into forward-looking, balance-driven metrics. */
const isActiveLoan = (loan: LoanApi): boolean => !loan.projection.isPaidOff;

/**
 * Share of active loans' original principal that has been repaid, expressed in the
 * base currency at live FX.
 *
 * Only active loans count: a settled loan's principal would pad the % with debt that
 * no longer exists, and with zero active loans "100% of $0 repaid" is meaningless —
 * signalled by a `null` return.
 *
 * Both principal and outstanding balance are converted from loan-currency figures at
 * live rates so they share one FX epoch. `refOriginalPrincipal` is unusable here: it's
 * frozen at creation-time FX while the balance floats at current FX, so currency moves
 * would fake (or hide) repayment progress on foreign-currency loans. Returns `null`
 * rather than mix epochs when a rate is unavailable.
 *
 * `percent` is clamped to [0, 100]: balance can exceed principal once interest has
 * accrued, which would otherwise surface as a negative "repaid".
 *
 * @returns `{ percent, totalPrincipal }` in base currency, or `null` when the base
 *   currency is unknown, a rate is missing, or no active principal exists.
 */
export const activePrincipalRepaid = ({
  loans,
  convert,
  baseCode,
}: {
  loans: LoanApi[];
  convert: ConvertFn;
  baseCode: string | null | undefined;
}): { percent: number; totalPrincipal: number } | null => {
  if (!baseCode) return null;
  let totalPrincipal = 0;
  let outstanding = 0;
  for (const loan of loans) {
    if (!isActiveLoan(loan)) continue;
    const principal = convert({ amount: loan.loanDetails.originalPrincipal, from: loan.currencyCode, to: baseCode });
    const balance = convert({
      amount: outstandingAmount({ balance: loan.currentBalance }),
      from: loan.currencyCode,
      to: baseCode,
    });
    if (principal === null || balance === null) return null;
    totalPrincipal += principal;
    outstanding += balance;
  }
  if (totalPrincipal <= 0) return null;
  const percent = Math.min(100, Math.max(0, ((totalPrincipal - outstanding) / totalPrincipal) * 100));
  return { percent, totalPrincipal };
};

/**
 * Outstanding-balance-weighted average APR across active loans, as a percent.
 *
 * Balances are already in base currency (`refCurrentBalance`), so no live-FX conversion
 * is needed. When every active loan carries zero outstanding balance the weighting
 * denominator collapses, so a plain unweighted average of the rates is returned instead.
 *
 * @returns the weighted APR, or `null` when there are no active loans.
 */
export const weightedAvgApr = ({ loans }: { loans: LoanApi[] }): number | null => {
  const active = loans.filter(isActiveLoan);
  if (!active.length) return null;
  const totalBalance = active.reduce((acc, loan) => acc + outstandingAmount({ balance: loan.refCurrentBalance }), 0);
  if (totalBalance <= 0) {
    const sum = active.reduce((acc, loan) => acc + loan.loanDetails.interestRate, 0);
    return sum / active.length;
  }
  const weighted = active.reduce(
    (acc, loan) => acc + loan.loanDetails.interestRate * outstandingAmount({ balance: loan.refCurrentBalance }),
    0,
  );
  return weighted / totalBalance;
};

/**
 * Total interest still to be paid across all loans that carry a projection, summed in
 * base currency at live FX.
 *
 * Per-loan `totalInterestRemaining` is in the loan's own currency, so each is converted
 * before summing. Loans without a projection (`totalInterestRemaining === null`) are
 * skipped. Returns `null` if any rate is unavailable rather than silently understating
 * the total.
 *
 * @returns the summed interest in base currency, or `null` when the base currency is
 *   unknown, no loan carries a projection, or a rate is missing.
 */
export const projectedInterestRemaining = ({
  loans,
  convert,
  baseCode,
}: {
  loans: LoanApi[];
  convert: ConvertFn;
  baseCode: string | null | undefined;
}): number | null => {
  if (!baseCode) return null;
  const withProjection = loans.filter((loan) => loan.projection.totalInterestRemaining !== null);
  if (!withProjection.length) return null;
  let sum = 0;
  for (const loan of withProjection) {
    const converted = convert({
      amount: loan.projection.totalInterestRemaining!,
      from: loan.currencyCode,
      to: baseCode,
    });
    if (converted === null) return null;
    sum += converted;
  }
  return sum;
};
