import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments/enums';
import { describe, expect, it, jest } from '@jest/globals';

import {
  type TransactionForGains,
  calculateAllGains,
  calculateRealizedGains,
  calculateUnrealizedGains,
} from './gains-calculator.utils';

describe('Gains Calculator Utils', () => {
  describe('calculateUnrealizedGains', () => {
    it('should calculate positive unrealized gains correctly', () => {
      const result = calculateUnrealizedGains(1200, 1000);

      expect(result.unrealizedGainValue).toBe(200);
      expect(result.unrealizedGainPercent).toBe(20);
    });

    it('should calculate negative unrealized gains correctly', () => {
      const result = calculateUnrealizedGains(800, 1000);

      expect(result.unrealizedGainValue).toBe(-200);
      expect(result.unrealizedGainPercent).toBe(-20);
    });

    it('should handle zero cost basis', () => {
      const result = calculateUnrealizedGains(1000, 0);

      expect(result.unrealizedGainValue).toBe(1000);
      expect(result.unrealizedGainPercent).toBe(0);
    });

    it('should handle zero market value', () => {
      const result = calculateUnrealizedGains(0, 1000);

      expect(result.unrealizedGainValue).toBe(-1000);
      expect(result.unrealizedGainPercent).toBe(-100);
    });
  });

  describe('calculateRealizedGains', () => {
    it('should handle empty transaction list', () => {
      const result = calculateRealizedGains([]);

      expect(result.realizedGainValue).toBe(0);
      expect(result.realizedGainPercent).toBe(0);
    });

    it('should handle only buy transactions', () => {
      const transactions: TransactionForGains[] = [
        {
          date: '2023-01-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 100,
          price: 10,
          fees: 5,
        },
      ];

      const result = calculateRealizedGains(transactions);

      expect(result.realizedGainValue).toBe(0);
      expect(result.realizedGainPercent).toBe(0);
    });

    it('should calculate simple buy-sell scenario with profit', () => {
      const transactions: TransactionForGains[] = [
        {
          date: '2023-01-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 100,
          price: 10,
          fees: 5, // $0.05 per share added to cost basis
        },
        {
          date: '2023-06-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: 100,
          price: 15,
          fees: 10, // $0.10 per share deducted from proceeds
        },
      ];

      const result = calculateRealizedGains(transactions);

      // Buy: 100 shares at $10.05 each (including fees) = $1,005 cost basis
      // Sell: 100 shares at $15 each = $1,500 gross proceeds
      // Less sell fees: $1,500 - $10 = $1,490 net proceeds
      // Gain: $1,490 - $1,005 = $485
      // Percentage: ($485 / $1,005) * 100 = ~48.26%
      expect(result.realizedGainValue).toBeCloseTo(485, 2);
      expect(result.realizedGainPercent).toBeCloseTo(48.26, 2);
    });

    it('should calculate simple buy-sell scenario with loss', () => {
      const transactions: TransactionForGains[] = [
        {
          date: '2023-01-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 100,
          price: 20,
          fees: 5,
        },
        {
          date: '2023-06-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: 100,
          price: 15,
          fees: 10,
        },
      ];

      const result = calculateRealizedGains(transactions);

      // Buy: 100 shares at $20.05 each = $2,005 cost basis
      // Sell: 100 shares at $15 each - $10 fees = $1,490 net proceeds
      // Loss: $1,490 - $2,005 = -$515
      // Percentage: (-$515 / $2,005) * 100 = ~-25.69%
      expect(result.realizedGainValue).toBeCloseTo(-515, 2);
      expect(result.realizedGainPercent).toBeCloseTo(-25.69, 2);
    });

    it('should handle FIFO (First In, First Out) correctly', () => {
      const transactions: TransactionForGains[] = [
        {
          date: '2023-01-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 100,
          price: 10,
          fees: 0,
        },
        {
          date: '2023-02-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 100,
          price: 15,
          fees: 0,
        },
        {
          date: '2023-06-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: 50, // Should sell from first lot (cheapest)
          price: 20,
          fees: 0,
        },
      ];

      const result = calculateRealizedGains(transactions);

      // Sell 50 shares from first lot (bought at $10)
      // Gain: (50 * $20) - (50 * $10) = $1,000 - $500 = $500
      // Percentage: ($500 / $500) * 100 = 100%
      expect(result.realizedGainValue).toBeCloseTo(500, 2);
      expect(result.realizedGainPercent).toBeCloseTo(100, 2);
    });

    it('should handle partial sales across multiple lots', () => {
      const transactions: TransactionForGains[] = [
        {
          date: '2023-01-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 100,
          price: 10,
          fees: 0,
        },
        {
          date: '2023-02-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 100,
          price: 15,
          fees: 0,
        },
        {
          date: '2023-06-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: 150, // Sells all of first lot + 50 of second lot
          price: 20,
          fees: 0,
        },
      ];

      const result = calculateRealizedGains(transactions);

      // Sell 100 shares from first lot at $10 + 50 shares from second lot at $15
      // First lot gain: (100 * $20) - (100 * $10) = $1,000
      // Second lot gain: (50 * $20) - (50 * $15) = $250
      // Total gain: $1,000 + $250 = $1,250
      // Total cost basis of sold shares: (100 * $10) + (50 * $15) = $1,750
      // Percentage: ($1,250 / $1,750) * 100 = ~71.43%
      expect(result.realizedGainValue).toBeCloseTo(1250, 2);
      expect(result.realizedGainPercent).toBeCloseTo(71.43, 2);
    });

    it('should handle multiple buy and sell transactions', () => {
      const transactions: TransactionForGains[] = [
        {
          date: '2023-01-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 100,
          price: 10,
          fees: 0,
        },
        {
          date: '2023-02-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: 50,
          price: 12,
          fees: 0,
        },
        {
          date: '2023-03-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 75,
          price: 11,
          fees: 0,
        },
        {
          date: '2023-04-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: 25,
          price: 15,
          fees: 0,
        },
      ];

      const result = calculateRealizedGains(transactions);

      // First sell: 50 shares at $12, cost basis $10 = (50 * $12) - (50 * $10) = $100 gain
      // Second sell: 25 shares at $15, cost basis $10 (from remaining first lot) = (25 * $15) - (25 * $10) = $125 gain
      // Total: $100 + $125 = $225
      // Total cost basis of sold shares: (50 + 25) * $10 = $750
      // Percentage: ($225 / $750) * 100 = 30%
      expect(result.realizedGainValue).toBeCloseTo(225, 2);
      expect(result.realizedGainPercent).toBeCloseTo(30, 2);
    });

    it('should handle transactions with string values', () => {
      const transactions: TransactionForGains[] = [
        {
          date: '2023-01-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '100',
          price: '10.50',
          fees: '5.00',
        },
        {
          date: '2023-06-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '100',
          price: '15.75',
          fees: '7.50',
        },
      ];

      const result = calculateRealizedGains(transactions);

      // Buy: 100 shares at $10.55 each (including $0.05 fees per share) = $1,055 cost basis
      // Sell: 100 shares at $15.75 each - $7.50 fees = $1,567.50 net proceeds
      // Gain: $1,567.50 - $1,055 = $512.50
      // Percentage: ($512.50 / $1,055) * 100 = ~48.58%
      expect(result.realizedGainValue).toBeCloseTo(512.5, 2);
      expect(result.realizedGainPercent).toBeCloseTo(48.58, 2);
    });

    it('should handle attempting to sell more than owned', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const transactions: TransactionForGains[] = [
        {
          date: '2023-01-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 100,
          price: 10,
          fees: 0,
        },
        {
          date: '2023-06-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: 150, // More than owned
          price: 15,
          fees: 0,
        },
      ];

      const result = calculateRealizedGains(transactions);

      // Should only process the 100 shares that were owned
      expect(result.realizedGainValue).toBeCloseTo(500, 2);
      expect(consoleSpy).toHaveBeenCalledWith('Attempted to sell 50 more shares than available');

      consoleSpy.mockRestore();
    });
  });

  describe('calculateAllGains', () => {
    it('should combine unrealized and realized gains correctly', () => {
      const transactions: TransactionForGains[] = [
        {
          date: '2023-01-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: 200,
          price: 10,
          fees: 0,
        },
        {
          date: '2023-06-01',
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: 100,
          price: 15,
          fees: 0,
        },
      ];

      const marketValue = 1200; // 100 remaining shares at $12 each
      const costBasis = 2000; // Original purchase of 200 shares at $10 each

      const result = calculateAllGains(marketValue, costBasis, transactions);

      expect(result.unrealizedGainValue).toBe(-800); // $1,200 - $2,000 = -$800
      expect(result.unrealizedGainPercent).toBe(-40); // (-$800 / $2,000) * 100 = -40%
      expect(result.realizedGainValue).toBe(500); // Sold 100 shares: (100 * $15) - (100 * $10) = $500
      expect(result.realizedGainPercent).toBe(50); // ($500 / $1,000) * 100 = 50%
    });
  });
});
