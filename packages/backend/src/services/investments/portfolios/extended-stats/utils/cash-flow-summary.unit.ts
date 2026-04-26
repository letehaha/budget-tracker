import { describe, expect, it } from '@jest/globals';

import { summarizeCashFlows } from './cash-flow-summary';

describe('summarizeCashFlows', () => {
  it('returns zeros and nulls for empty input', () => {
    const result = summarizeCashFlows({
      externalFlows: [],
      dividends: [],
      referenceDate: new Date('2025-04-01'),
      firstBuyDate: null,
    });
    expect(result.totalDeposits).toBe(0);
    expect(result.totalWithdrawals).toBe(0);
    expect(result.netInvested).toBe(0);
    expect(result.totalDividends).toBe(0);
    expect(result.averageMonthlyDividends).toBeNull();
    expect(result.firstTransactionDate).toBeNull();
    expect(result.portfolioAgeDays).toBeNull();
  });

  it('sums deposits and withdrawals; uses first deposit when there are no buys', () => {
    const result = summarizeCashFlows({
      externalFlows: [
        { date: '2024-01-01', direction: 'deposit', amount: 1000 },
        { date: '2024-04-01', direction: 'deposit', amount: 500 },
        { date: '2024-08-01', direction: 'withdrawal', amount: 200 },
      ],
      dividends: [],
      referenceDate: new Date('2025-01-01'),
      firstBuyDate: null,
    });
    expect(result.totalDeposits).toBe(1500);
    expect(result.totalWithdrawals).toBe(200);
    expect(result.netInvested).toBe(1300);
    // First deposit is 2024-01-01; with no buys, age starts there.
    expect(result.firstTransactionDate).toBe('2024-01-01');
    expect(result.portfolioAgeDays).toBe(366); // 2024 is a leap year.
  });

  it('uses the first buy when it predates any deposit', () => {
    // (Edge case: a buy could be backdated before the deposit if a user records history.)
    const result = summarizeCashFlows({
      externalFlows: [{ date: '2024-04-01', direction: 'deposit', amount: 5000 }],
      dividends: [],
      referenceDate: new Date('2025-01-01'),
      firstBuyDate: new Date('2024-02-01'),
    });
    expect(result.firstTransactionDate).toBe('2024-02-01');
  });

  it('uses the first deposit when it predates the first buy', () => {
    const result = summarizeCashFlows({
      externalFlows: [
        { date: '2024-01-01', direction: 'deposit', amount: 5000 },
        { date: '2024-02-01', direction: 'deposit', amount: 5000 },
      ],
      dividends: [{ date: '2024-06-01', amount: 50 }],
      referenceDate: new Date('2025-01-01'),
      firstBuyDate: new Date('2024-03-15'),
    });
    expect(result.firstTransactionDate).toBe('2024-01-01');
  });

  it('ignores withdrawal-only days when picking the start', () => {
    const result = summarizeCashFlows({
      externalFlows: [
        { date: '2023-01-01', direction: 'withdrawal', amount: 100 }, // earlier, but only a withdrawal
        { date: '2024-04-01', direction: 'deposit', amount: 5000 },
      ],
      dividends: [],
      referenceDate: new Date('2025-01-01'),
      firstBuyDate: null,
    });
    expect(result.firstTransactionDate).toBe('2024-04-01');
  });

  it('uses trailing-12mo dividends ÷ 12 when portfolio ≥ 1 year old', () => {
    const result = summarizeCashFlows({
      externalFlows: [{ date: '2023-01-01', direction: 'deposit', amount: 10000 }],
      dividends: [
        { date: '2023-06-01', amount: 999 }, // outside trailing 12mo
        { date: '2024-05-01', amount: 200 }, // inside
        { date: '2024-12-01', amount: 200 }, // inside
        { date: '2025-03-01', amount: 200 }, // inside
      ],
      referenceDate: new Date('2025-04-01'),
      firstBuyDate: new Date('2023-01-15'),
    });
    expect(result.totalDividends).toBe(1599);
    expect(result.averageMonthlyDividends).toBeCloseTo(50, 6);
  });

  it('uses lifetime ÷ months when portfolio is younger than 1 year', () => {
    // Earliest of (deposit 2024-09-01, buy 2024-10-01) = 2024-09-01.
    // Age = 122 days → ~4.01 months → 300 / 4.01 ≈ 74.8/mo.
    const result = summarizeCashFlows({
      externalFlows: [{ date: '2024-09-01', direction: 'deposit', amount: 5000 }],
      dividends: [
        { date: '2024-11-01', amount: 100 },
        { date: '2024-12-01', amount: 100 },
        { date: '2025-01-01', amount: 100 },
      ],
      referenceDate: new Date('2025-01-01'),
      firstBuyDate: new Date('2024-10-01'),
    });
    expect(result.totalDividends).toBe(300);
    expect(result.averageMonthlyDividends).not.toBeNull();
    expect(result.averageMonthlyDividends!).toBeGreaterThan(70);
    expect(result.averageMonthlyDividends!).toBeLessThan(80);
  });

  it('clamps portfolio age in months to >= 1 to avoid divide-by-zero', () => {
    const result = summarizeCashFlows({
      externalFlows: [{ date: '2025-01-01', direction: 'deposit', amount: 5000 }],
      dividends: [{ date: '2025-01-01', amount: 100 }],
      referenceDate: new Date('2025-01-01'),
      firstBuyDate: new Date('2025-01-01'),
    });
    expect(result.portfolioAgeDays).toBe(0);
    expect(result.averageMonthlyDividends).toBe(100);
  });

  it('returns null avg dividends when there are no dividends', () => {
    const result = summarizeCashFlows({
      externalFlows: [{ date: '2024-01-01', direction: 'deposit', amount: 1000 }],
      dividends: [],
      referenceDate: new Date('2025-01-01'),
      firstBuyDate: new Date('2024-02-01'),
    });
    expect(result.totalDividends).toBe(0);
    expect(result.averageMonthlyDividends).toBeNull();
  });

  it('returns null avg dividends when there are dividends but no deposits/buys (age unknown)', () => {
    const result = summarizeCashFlows({
      externalFlows: [],
      dividends: [{ date: '2024-06-01', amount: 50 }],
      referenceDate: new Date('2025-01-01'),
      firstBuyDate: null,
    });
    expect(result.totalDividends).toBe(50);
    expect(result.averageMonthlyDividends).toBeNull();
    expect(result.firstTransactionDate).toBeNull();
  });
});
