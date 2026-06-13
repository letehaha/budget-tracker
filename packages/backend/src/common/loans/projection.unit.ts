import { describe, expect, it } from '@jest/globals';

import { computeLoanProjection } from './projection';

const TODAY = new Date('2026-06-09T00:00:00Z');

describe('computeLoanProjection', () => {
  describe('paid-off loan', () => {
    it('flags isPaidOff true when balance is exactly zero', () => {
      const result = computeLoanProjection({
        currentBalanceCents: 0,
        originalPrincipalCents: 32_000_000,
        interestRate: 3.75,
        plannedPaymentCents: 150_000,
        today: TODAY,
      });

      expect(result.isPaidOff).toBe(true);
      expect(result.payoffDate).toBeNull();
      expect(result.monthsRemaining).toBe(0);
      expect(result.totalInterestRemaining).toBe(0);
      expect(result.paidToDate).toBe(320_000);
      expect(result.paidToDatePercent).toBe(100);
      expect(result.warning).toBeNull();
    });

    it('flags isPaidOff true when the balance is negative (overpaid)', () => {
      const result = computeLoanProjection({
        currentBalanceCents: -500,
        originalPrincipalCents: 32_000_000,
        interestRate: 3.75,
        plannedPaymentCents: 150_000,
        today: TODAY,
      });

      expect(result.isPaidOff).toBe(true);
      expect(result.paidToDatePercent).toBe(100);
    });
  });

  describe('no planned payment', () => {
    it('returns a no_planned_payment warning and skips forward-looking fields', () => {
      const result = computeLoanProjection({
        currentBalanceCents: 24_510_050,
        originalPrincipalCents: 32_000_000,
        interestRate: 3.75,
        plannedPaymentCents: null,
        today: TODAY,
      });

      expect(result.warning).toBe('no_planned_payment');
      expect(result.payoffDate).toBeNull();
      expect(result.monthsRemaining).toBeNull();
      expect(result.totalInterestRemaining).toBeNull();
      expect(result.monthlyPrincipal).toBeNull();
      // monthly interest is still shown — it's a property of the current state, not the plan.
      expect(result.monthlyInterest).toBeGreaterThan(0);
      expect(result.paidToDate).toBe(74_899.5);
    });
  });

  describe('payment below monthly interest', () => {
    it('returns a payment_below_interest warning when payment cannot cover accrual', () => {
      const result = computeLoanProjection({
        currentBalanceCents: 24_510_050,
        originalPrincipalCents: 32_000_000,
        interestRate: 3.75,
        plannedPaymentCents: 10_000, // $100 / mo, vastly below monthly interest
        today: TODAY,
      });

      expect(result.warning).toBe('payment_below_interest');
      expect(result.payoffDate).toBeNull();
      expect(result.monthsRemaining).toBeNull();
      expect(result.monthlyPrincipal).toBeLessThan(0);
    });

    it('treats exact equality (payment == interest) as below — no principal would be paid down', () => {
      const balance = 12_000_000; // $120,000
      const apr = 6.0; // 0.5% monthly
      const monthlyInterestCents = (balance * apr) / 100 / 12; // 60,000 cents = $600

      const result = computeLoanProjection({
        currentBalanceCents: balance,
        originalPrincipalCents: balance,
        interestRate: apr,
        plannedPaymentCents: monthlyInterestCents,
        today: TODAY,
      });

      expect(result.warning).toBe('payment_below_interest');
    });
  });

  describe('standard amortization', () => {
    it('matches a hand-computed 30-year mortgage payoff', () => {
      // 30-year mortgage, $200,000 at 6.00% APR. Standard payment for full term
      // is ~$1,199.10. Use a round payment of $1,200 to keep the test stable.
      const result = computeLoanProjection({
        currentBalanceCents: 200_00 * 1000, // $200,000 in cents
        originalPrincipalCents: 200_00 * 1000,
        interestRate: 6.0,
        plannedPaymentCents: 120_000, // $1,200 / month
        today: TODAY,
      });

      expect(result.isPaidOff).toBe(false);
      expect(result.warning).toBeNull();
      expect(result.monthsRemaining).toBe(360);
      expect(result.payoffDate).toBe('2056-06-09');
      // Total interest paid over the full term at $1200/mo:
      //   1200 * 360 − 200000 = 432000 − 200000 = $232,000.
      expect(result.totalInterestRemaining).toBeCloseTo(232_000, 0);
      // First-month interest on $200k @ 6% APR = $1,000.00.
      expect(result.monthlyInterest).toBeCloseTo(1_000, 1);
      expect(result.monthlyPrincipal).toBeCloseTo(200, 1);
    });

    it('handles zero APR as a degenerate case (no interest, no log formula)', () => {
      const result = computeLoanProjection({
        currentBalanceCents: 12_000_00, // $12,000
        originalPrincipalCents: 12_000_00,
        interestRate: 0,
        plannedPaymentCents: 100_00, // $100 / month
        today: TODAY,
      });

      expect(result.isPaidOff).toBe(false);
      expect(result.warning).toBeNull();
      expect(result.monthsRemaining).toBe(120);
      expect(result.totalInterestRemaining).toBe(0);
      expect(result.monthlyInterest).toBe(0);
      expect(result.monthlyPrincipal).toBe(100);
    });

    it('rounds the final month upward — partial months always finish payoff', () => {
      // $1,000 balance, 0% APR, $300/month → 3.33 months → 4 months projected.
      const result = computeLoanProjection({
        currentBalanceCents: 1_000_00,
        originalPrincipalCents: 1_000_00,
        interestRate: 0,
        plannedPaymentCents: 300_00,
        today: TODAY,
      });

      expect(result.monthsRemaining).toBe(4);
    });
  });

  describe('paid-to-date metrics', () => {
    it('reports the percentage of the original principal repaid', () => {
      const result = computeLoanProjection({
        currentBalanceCents: 24_000_000, // $240k remaining
        originalPrincipalCents: 32_000_000, // out of $320k
        interestRate: 3.75,
        plannedPaymentCents: 150_000,
        today: TODAY,
      });

      // $80k of $320k paid = 25.0%
      expect(result.paidToDate).toBe(80_000);
      expect(result.paidToDatePercent).toBe(25);
    });

    it('clamps an overpaid loan to 100%', () => {
      const result = computeLoanProjection({
        currentBalanceCents: -1_000, // $10 overpaid
        originalPrincipalCents: 32_000_000,
        interestRate: 3.75,
        plannedPaymentCents: 150_000,
        today: TODAY,
      });

      expect(result.paidToDatePercent).toBe(100);
    });

    it('returns 0 when the original principal is zero (degenerate input)', () => {
      const result = computeLoanProjection({
        currentBalanceCents: 100,
        originalPrincipalCents: 0,
        interestRate: 3.75,
        plannedPaymentCents: 150_000,
        today: TODAY,
      });

      expect(result.paidToDatePercent).toBe(0);
    });
  });

  describe('non-amortizing horizon (zero APR, tiny payment)', () => {
    it('does not amortize within a projectable horizon when a 0% loan has a near-zero payment', () => {
      // $100,000 at 0% APR paid one cent per month would take a billion months —
      // far beyond any horizon a Date can represent. The projection must refuse to
      // amortize rather than overflow into a "NaN-NaN-NaN" payoff date.
      const result = computeLoanProjection({
        currentBalanceCents: 10_000_000, // $100,000
        originalPrincipalCents: 10_000_000,
        interestRate: 0,
        plannedPaymentCents: 1, // one cent / month
        today: TODAY,
      });

      expect(result.warning).toBe('payment_below_interest');
      expect(result.payoffDate).toBeNull();
      expect(result.monthsRemaining).toBeNull();
      expect(result.totalInterestRemaining).toBeNull();
      expect(result.isPaidOff).toBe(false);
    });

    it('never emits a NaN payoff date for a 0% loan with a near-zero payment', () => {
      const result = computeLoanProjection({
        currentBalanceCents: 10_000_000,
        originalPrincipalCents: 10_000_000,
        interestRate: 0,
        plannedPaymentCents: 1,
        today: TODAY,
      });

      // A non-amortizing horizon yields no payoff date at all — never the
      // "NaN-NaN-NaN" string an unguarded Date overflow would serialize.
      expect(result.payoffDate).not.toBe('NaN-NaN-NaN');
      expect(result.payoffDate).toBeNull();
    });

    it('still projects a valid payoff for a normal 0% loan inside the horizon', () => {
      // $12,000 at 0% APR, $1,000/month → exactly 12 months, well within the horizon.
      const result = computeLoanProjection({
        currentBalanceCents: 1_200_000, // $12,000
        originalPrincipalCents: 1_200_000,
        interestRate: 0,
        plannedPaymentCents: 100_000, // $1,000 / month
        today: TODAY,
      });

      expect(result.monthsRemaining).toBe(12);
      expect(result.warning).toBeNull();
      expect(result.payoffDate).not.toBeNull();
      expect(result.payoffDate).not.toContain('NaN');
    });
  });

  describe('zero planned payment means no plan, not an underfunded plan', () => {
    it('treats a zero planned payment on an interest-bearing loan as no_planned_payment', () => {
      const result = computeLoanProjection({
        currentBalanceCents: 24_510_050,
        originalPrincipalCents: 32_000_000,
        interestRate: 5,
        plannedPaymentCents: 0,
        today: TODAY,
      });

      expect(result.warning).toBe('no_planned_payment');
      expect(result.monthsRemaining).toBeNull();
      expect(result.monthlyPrincipal).toBeNull();
    });

    it('treats a zero planned payment on a zero-APR loan as no_planned_payment', () => {
      const result = computeLoanProjection({
        currentBalanceCents: 1_200_000,
        originalPrincipalCents: 1_200_000,
        interestRate: 0,
        plannedPaymentCents: 0,
        today: TODAY,
      });

      expect(result.warning).toBe('no_planned_payment');
      expect(result.monthsRemaining).toBeNull();
      expect(result.monthlyPrincipal).toBeNull();
    });

    it('still flags a positive-but-underfunded payment as payment_below_interest', () => {
      // $300,000 at 12% APR accrues $3,000/month interest; a $1,000 payment is
      // positive yet below that accrual, so it never reaches the horizon cap.
      const result = computeLoanProjection({
        currentBalanceCents: 30_000_000, // $300,000
        originalPrincipalCents: 30_000_000,
        interestRate: 12,
        plannedPaymentCents: 100_000, // $1,000 / month
        today: TODAY,
      });

      expect(result.warning).toBe('payment_below_interest');
      expect(result.monthsRemaining).toBeNull();
      expect(result.monthlyPrincipal).toBeLessThan(0);
    });

    it('still treats a null planned payment as no_planned_payment', () => {
      const result = computeLoanProjection({
        currentBalanceCents: 24_510_050,
        originalPrincipalCents: 32_000_000,
        interestRate: 5,
        plannedPaymentCents: null,
        today: TODAY,
      });

      expect(result.warning).toBe('no_planned_payment');
      expect(result.monthsRemaining).toBeNull();
      expect(result.monthlyPrincipal).toBeNull();
    });
  });

  describe('determinism', () => {
    it('returns the same result when called repeatedly with the same input', () => {
      const input = {
        currentBalanceCents: 24_510_050,
        originalPrincipalCents: 32_000_000,
        interestRate: 3.75,
        plannedPaymentCents: 150_000,
        today: TODAY,
      };

      expect(computeLoanProjection(input)).toEqual(computeLoanProjection(input));
    });

    it('uses the injected `today` to anchor payoffDate, not the wall clock', () => {
      const earlyToday = new Date('2026-01-15T00:00:00Z');
      const lateToday = new Date('2026-12-15T00:00:00Z');

      const early = computeLoanProjection({
        currentBalanceCents: 1_000_00,
        originalPrincipalCents: 1_000_00,
        interestRate: 0,
        plannedPaymentCents: 100_00,
        today: earlyToday,
      });
      const late = computeLoanProjection({
        currentBalanceCents: 1_000_00,
        originalPrincipalCents: 1_000_00,
        interestRate: 0,
        plannedPaymentCents: 100_00,
        today: lateToday,
      });

      expect(early.payoffDate).toBe('2026-11-15');
      expect(late.payoffDate).toBe('2027-10-15');
    });

    it('clamps payoffDate to the last day of short months instead of overflowing', () => {
      // Jan 31 + N months must land on the target month's last day (Feb 28,
      // Apr 30), not overflow into the following month via Date normalization.
      const todayJan31 = new Date(2026, 0, 31);

      const oneMonth = computeLoanProjection({
        currentBalanceCents: 100_00,
        originalPrincipalCents: 100_00,
        interestRate: 0,
        plannedPaymentCents: 100_00,
        today: todayJan31,
      });
      expect(oneMonth.monthsRemaining).toBe(1);
      expect(oneMonth.payoffDate).toBe('2026-02-28');

      const threeMonths = computeLoanProjection({
        currentBalanceCents: 300_00,
        originalPrincipalCents: 300_00,
        interestRate: 0,
        plannedPaymentCents: 100_00,
        today: todayJan31,
      });
      expect(threeMonths.monthsRemaining).toBe(3);
      expect(threeMonths.payoffDate).toBe('2026-04-30');
    });
  });
});
