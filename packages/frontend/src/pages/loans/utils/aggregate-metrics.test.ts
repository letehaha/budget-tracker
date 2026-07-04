import type { LoanApi } from '@/api/loans';
import { describe, expect, it } from 'vitest';

import { activePrincipalRepaid, projectedInterestRemaining, weightedAvgApr } from './aggregate-metrics';

type ConvertFn = (params: { amount: number; from: string; to: string }) => number | null;

// Rates expressed against USD (1 unit of currency = N USD).
const RATE_TO_USD: Record<string, number> = { USD: 1, EUR: 1.1, GBP: 1.25 };

/**
 * Deterministic stand-in for the live-FX converter. Any currency listed in `missing`
 * (or absent from the rate table) yields `null`, mirroring an unavailable rate.
 */
const makeConvert =
  (missing: string[] = []): ConvertFn =>
  ({ amount, from, to }) => {
    if (missing.includes(from) || missing.includes(to)) return null;
    const fromRate = RATE_TO_USD[from];
    const toRate = RATE_TO_USD[to];
    if (fromRate === undefined || toRate === undefined) return null;
    return (amount * fromRate) / toRate;
  };

const makeLoan = ({
  currencyCode = 'USD',
  currentBalance = 0,
  refCurrentBalance = 0,
  originalPrincipal = 0,
  interestRate = 0,
  totalInterestRemaining = null,
  isPaidOff = false,
}: {
  currencyCode?: string;
  currentBalance?: number;
  refCurrentBalance?: number;
  originalPrincipal?: number;
  interestRate?: number;
  totalInterestRemaining?: number | null;
  isPaidOff?: boolean;
}): LoanApi =>
  ({
    currencyCode,
    currentBalance,
    refCurrentBalance,
    loanDetails: { originalPrincipal, interestRate },
    projection: { totalInterestRemaining, isPaidOff },
  }) as unknown as LoanApi;

describe('activePrincipalRepaid', () => {
  it('converts each loan into base currency at the given rates before aggregating', () => {
    const result = activePrincipalRepaid({
      loans: [
        // USD loan: principal 1000, outstanding 400.
        makeLoan({ currencyCode: 'USD', originalPrincipal: 1000, currentBalance: -400 }),
        // EUR loan: principal 1000, outstanding 500 → ×1.1 into USD.
        makeLoan({ currencyCode: 'EUR', originalPrincipal: 1000, currentBalance: -500 }),
      ],
      convert: makeConvert(),
      baseCode: 'USD',
    });

    // totalPrincipal = 1000 + 1100 = 2100; outstanding = 400 + 550 = 950.
    // percent = (2100 - 950) / 2100 * 100 = 54.7619…
    expect(result).not.toBeNull();
    expect(result!.totalPrincipal).toBeCloseTo(2100, 6);
    expect(result!.percent).toBeCloseTo((1150 / 2100) * 100, 6);
  });

  it('excludes paid-off loans from the active basis', () => {
    const active = makeLoan({ currencyCode: 'USD', originalPrincipal: 1000, currentBalance: -400 });
    const withoutPaidOff = activePrincipalRepaid({ loans: [active], convert: makeConvert(), baseCode: 'USD' });
    const withPaidOff = activePrincipalRepaid({
      loans: [
        active,
        // A settled loan with a large principal must not pad the totals.
        makeLoan({ currencyCode: 'USD', originalPrincipal: 999999, currentBalance: 0, isPaidOff: true }),
      ],
      convert: makeConvert(),
      baseCode: 'USD',
    });

    expect(withPaidOff).toEqual(withoutPaidOff);
    expect(withPaidOff!.totalPrincipal).toBeCloseTo(1000, 6);
  });

  it('returns null when a required rate is unavailable', () => {
    const result = activePrincipalRepaid({
      loans: [makeLoan({ currencyCode: 'EUR', originalPrincipal: 1000, currentBalance: -500 })],
      convert: makeConvert(['EUR']),
      baseCode: 'USD',
    });
    expect(result).toBeNull();
  });

  it('clamps repaid percent to a floor of 0 when balance exceeds principal', () => {
    // Accrued interest pushes outstanding (1500) above the original principal (1000).
    const result = activePrincipalRepaid({
      loans: [makeLoan({ currencyCode: 'USD', originalPrincipal: 1000, currentBalance: -1500 })],
      convert: makeConvert(),
      baseCode: 'USD',
    });
    expect(result!.percent).toBe(0);
  });

  it('caps repaid percent at 100 when nothing is outstanding', () => {
    // A zero/credit balance yields zero outstanding → fully repaid, never above 100.
    const result = activePrincipalRepaid({
      loans: [makeLoan({ currencyCode: 'USD', originalPrincipal: 1000, currentBalance: 0 })],
      convert: makeConvert(),
      baseCode: 'USD',
    });
    expect(result!.percent).toBe(100);
  });

  it('returns null when the active set is empty', () => {
    expect(activePrincipalRepaid({ loans: [], convert: makeConvert(), baseCode: 'USD' })).toBeNull();
    expect(
      activePrincipalRepaid({
        loans: [makeLoan({ originalPrincipal: 1000, currentBalance: -400, isPaidOff: true })],
        convert: makeConvert(),
        baseCode: 'USD',
      }),
    ).toBeNull();
  });

  it('returns null when the base currency is unknown', () => {
    expect(
      activePrincipalRepaid({
        loans: [makeLoan({ originalPrincipal: 1000, currentBalance: -400 })],
        convert: makeConvert(),
        baseCode: null,
      }),
    ).toBeNull();
  });
});

describe('weightedAvgApr', () => {
  it('weights each APR by the outstanding base-currency balance', () => {
    const apr = weightedAvgApr({
      loans: [
        makeLoan({ refCurrentBalance: -1000, interestRate: 5 }),
        makeLoan({ refCurrentBalance: -3000, interestRate: 10 }),
      ],
    });
    // (5×1000 + 10×3000) / 4000 = 35000 / 4000 = 8.75
    expect(apr).toBeCloseTo(8.75, 6);
  });

  it('excludes paid-off loans from the weighting', () => {
    const apr = weightedAvgApr({
      loans: [
        makeLoan({ refCurrentBalance: -1000, interestRate: 5 }),
        makeLoan({ refCurrentBalance: -3000, interestRate: 20, isPaidOff: true }),
      ],
    });
    // Only the active loan remains → its own rate.
    expect(apr).toBeCloseTo(5, 6);
  });

  it('falls back to an unweighted average when every active balance is zero', () => {
    const apr = weightedAvgApr({
      loans: [
        makeLoan({ refCurrentBalance: 0, interestRate: 4 }),
        // A positive (credit) balance also contributes zero outstanding.
        makeLoan({ refCurrentBalance: 250, interestRate: 8 }),
      ],
    });
    // totalBalance ≤ 0 → (4 + 8) / 2 = 6
    expect(apr).toBeCloseTo(6, 6);
  });

  it('returns null when there are no active loans', () => {
    expect(weightedAvgApr({ loans: [] })).toBeNull();
    expect(
      weightedAvgApr({ loans: [makeLoan({ refCurrentBalance: -1000, interestRate: 5, isPaidOff: true })] }),
    ).toBeNull();
  });
});

describe('projectedInterestRemaining', () => {
  it('converts each loan projection into base currency before summing', () => {
    const sum = projectedInterestRemaining({
      loans: [
        makeLoan({ currencyCode: 'USD', totalInterestRemaining: 100 }),
        makeLoan({ currencyCode: 'EUR', totalInterestRemaining: 200 }),
      ],
      convert: makeConvert(),
      baseCode: 'USD',
    });
    // 100 + 200×1.1 = 320
    expect(sum).toBeCloseTo(320, 6);
  });

  it('skips loans without a projection', () => {
    const sum = projectedInterestRemaining({
      loans: [
        makeLoan({ currencyCode: 'USD', totalInterestRemaining: 100 }),
        makeLoan({ currencyCode: 'USD', totalInterestRemaining: null }),
      ],
      convert: makeConvert(),
      baseCode: 'USD',
    });
    expect(sum).toBeCloseTo(100, 6);
  });

  it('includes paid-off loans that still carry a projection', () => {
    const sum = projectedInterestRemaining({
      loans: [makeLoan({ currencyCode: 'USD', totalInterestRemaining: 50, isPaidOff: true })],
      convert: makeConvert(),
      baseCode: 'USD',
    });
    expect(sum).toBeCloseTo(50, 6);
  });

  it('returns null when a required rate is unavailable', () => {
    const sum = projectedInterestRemaining({
      loans: [makeLoan({ currencyCode: 'EUR', totalInterestRemaining: 200 })],
      convert: makeConvert(['EUR']),
      baseCode: 'USD',
    });
    expect(sum).toBeNull();
  });

  it('returns null when no loan carries a projection', () => {
    const sum = projectedInterestRemaining({
      loans: [makeLoan({ currencyCode: 'USD', totalInterestRemaining: null })],
      convert: makeConvert(),
      baseCode: 'USD',
    });
    expect(sum).toBeNull();
  });

  it('returns null when the base currency is unknown', () => {
    const sum = projectedInterestRemaining({
      loans: [makeLoan({ currencyCode: 'USD', totalInterestRemaining: 100 })],
      convert: makeConvert(),
      baseCode: undefined,
    });
    expect(sum).toBeNull();
  });
});
