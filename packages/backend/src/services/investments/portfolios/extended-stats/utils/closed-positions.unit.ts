import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments/enums';
import { describe, expect, it } from '@jest/globals';

import { type ClosedPositionTransaction, calculateClosedPositions, summarizeClosedPositions } from './closed-positions';

const buy = (date: string, quantity: number, price: number, fees = 0): ClosedPositionTransaction => ({
  date,
  category: INVESTMENT_TRANSACTION_CATEGORY.buy,
  quantity,
  price,
  fees,
});

const sell = (date: string, quantity: number, price: number, fees = 0): ClosedPositionTransaction => ({
  date,
  category: INVESTMENT_TRANSACTION_CATEGORY.sell,
  quantity,
  price,
  fees,
});

const dividend = (date: string, quantity: number, price: number): ClosedPositionTransaction => ({
  date,
  category: INVESTMENT_TRANSACTION_CATEGORY.dividend,
  quantity,
  price,
  fees: 0,
});

describe('calculateClosedPositions', () => {
  it('returns no closed positions when only buys exist', () => {
    expect(calculateClosedPositions({ transactions: [buy('2024-01-01', 100, 10)] })).toEqual([]);
  });

  it('does not close a position on a partial sell', () => {
    const result = calculateClosedPositions({
      transactions: [buy('2024-01-01', 100, 10), sell('2024-06-01', 50, 12)],
    });
    expect(result).toEqual([]);
  });

  it('closes a position after a buy → full sell', () => {
    const result = calculateClosedPositions({
      transactions: [buy('2024-01-01', 100, 10), sell('2024-06-01', 100, 12)],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.costBasis).toBeCloseTo(1000, 6);
    expect(result[0]!.proceeds).toBeCloseTo(1200, 6);
    expect(result[0]!.gain).toBeCloseTo(200, 6);
    expect(result[0]!.gainPercent).toBeCloseTo(20, 6);
  });

  it('closes a losing position', () => {
    const result = calculateClosedPositions({
      transactions: [buy('2024-01-01', 100, 10), sell('2024-06-01', 100, 8)],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.gain).toBeCloseTo(-200, 6);
    expect(result[0]!.gainPercent).toBeCloseTo(-20, 6);
  });

  it('handles fees on both legs', () => {
    // Buy 100 @ $10 with $5 fee → cost basis = 1005
    // Sell 100 @ $12 with $7 fee → net proceeds = 1193
    // Gain = 188; pct = 188/1005 ≈ 18.71%
    const result = calculateClosedPositions({
      transactions: [buy('2024-01-01', 100, 10, 5), sell('2024-06-01', 100, 12, 7)],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.costBasis).toBeCloseTo(1005, 6);
    expect(result[0]!.proceeds).toBeCloseTo(1193, 6);
    expect(result[0]!.gain).toBeCloseTo(188, 6);
    expect(result[0]!.gainPercent).toBeCloseTo(18.7065, 3);
  });

  it('aggregates multiple sells that together close the position', () => {
    const result = calculateClosedPositions({
      transactions: [buy('2024-01-01', 100, 10), sell('2024-06-01', 40, 12), sell('2024-09-01', 60, 14)],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.costBasis).toBeCloseTo(1000, 6);
    expect(result[0]!.proceeds).toBeCloseTo(40 * 12 + 60 * 14, 6);
    expect(result[0]!.closedAt).toEqual(new Date('2024-09-01'));
  });

  it('treats re-buy after close as a fresh position', () => {
    const result = calculateClosedPositions({
      transactions: [
        buy('2024-01-01', 100, 10),
        sell('2024-06-01', 100, 12),
        buy('2024-09-01', 50, 20),
        sell('2024-12-01', 50, 25),
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.gain).toBeCloseTo(200, 6);
    expect(result[1]!.costBasis).toBeCloseTo(1000, 6);
    expect(result[1]!.proceeds).toBeCloseTo(1250, 6);
    expect(result[1]!.gain).toBeCloseTo(250, 6);
  });

  it('uses FIFO across multiple buy lots when partial sells then a full close occur', () => {
    // Buy 50 @ $10, Buy 50 @ $20 → avg cost basis = $1500 (50*10 + 50*20)
    // Sell 60 @ $25 → consumes 50 @ $10 and 10 @ $20 → cost basis used = 50*10 + 10*20 = 700, proceeds = 1500
    // Sell 40 @ $30 → consumes remaining 40 @ $20 → cost basis = 800, proceeds = 1200
    // Closes: total cost basis = 1500, total proceeds = 2700, gain = 1200, pct = 80%
    const result = calculateClosedPositions({
      transactions: [
        buy('2024-01-01', 50, 10),
        buy('2024-02-01', 50, 20),
        sell('2024-06-01', 60, 25),
        sell('2024-09-01', 40, 30),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.costBasis).toBeCloseTo(1500, 6);
    expect(result[0]!.proceeds).toBeCloseTo(2700, 6);
    expect(result[0]!.gain).toBeCloseTo(1200, 6);
    expect(result[0]!.gainPercent).toBeCloseTo(80, 6);
  });

  it('ignores dividend transactions (no holding effect)', () => {
    const result = calculateClosedPositions({
      transactions: [buy('2024-01-01', 100, 10), dividend('2024-03-01', 100, 0.5), sell('2024-06-01', 100, 12)],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.gain).toBeCloseTo(200, 6);
  });

  it('records openedAt and closedAt correctly', () => {
    const result = calculateClosedPositions({
      transactions: [buy('2024-03-15', 100, 10), sell('2024-08-22', 100, 12)],
    });
    expect(result[0]!.openedAt).toEqual(new Date('2024-03-15'));
    expect(result[0]!.closedAt).toEqual(new Date('2024-08-22'));
  });
});

describe('summarizeClosedPositions', () => {
  it('returns zeros for empty input', () => {
    const result = summarizeClosedPositions({ transactionsBySecurity: [] });
    expect(result.closedCount).toBe(0);
    expect(result.winningCount).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.avgGain).toBe(0);
    expect(result.avgGainPercent).toBe(0);
  });

  it('aggregates across securities and computes win rate', () => {
    // Security A: closed with $200 gain
    // Security B: closed with -$100 loss
    // Security C: closed with $50 gain
    // Win rate = 2/3 ≈ 66.67%, avg gain = 150/3 = 50
    const result = summarizeClosedPositions({
      transactionsBySecurity: [
        [buy('2024-01-01', 100, 10), sell('2024-06-01', 100, 12)],
        [buy('2024-02-01', 50, 20), sell('2024-07-01', 50, 18)],
        [buy('2024-03-01', 10, 100), sell('2024-08-01', 10, 105)],
      ],
    });
    expect(result.closedCount).toBe(3);
    expect(result.winningCount).toBe(2);
    expect(result.winRate).toBeCloseTo(66.667, 2);
    expect(result.avgGain).toBeCloseTo(50, 6);
  });

  it('skips securities with no closed positions', () => {
    const result = summarizeClosedPositions({
      transactionsBySecurity: [
        [buy('2024-01-01', 100, 10), sell('2024-06-01', 100, 12)],
        [buy('2024-02-01', 50, 20)], // never closed
      ],
    });
    expect(result.closedCount).toBe(1);
    expect(result.winRate).toBeCloseTo(100, 6);
  });
});
