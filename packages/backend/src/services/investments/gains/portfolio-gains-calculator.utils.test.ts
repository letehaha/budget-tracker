import { describe, expect, it } from 'vitest';

import { type HoldingForPortfolioGains, calculatePortfolioGains } from './portfolio-gains-calculator.utils';

describe('Portfolio Gains Calculator Utils', () => {
  describe('calculatePortfolioGains', () => {
    it('should return zero values for empty portfolio', () => {
      const result = calculatePortfolioGains([]);

      expect(result.totalCurrentValue).toBe(0);
      expect(result.totalCostBasis).toBe(0);
      expect(result.unrealizedGainValue).toBe(0);
      expect(result.unrealizedGainPercent).toBe(0);
      expect(result.realizedGainValue).toBe(0);
      expect(result.realizedGainPercent).toBe(0);
    });

    it('should calculate portfolio gains for single holding', () => {
      const holdings: HoldingForPortfolioGains[] = [
        {
          marketValue: 1200,
          costBasis: 1000,
          unrealizedGainValue: 200,
          unrealizedGainPercent: 20,
          realizedGainValue: 100,
          realizedGainPercent: 25, // Based on $400 cost basis of sold shares
        },
      ];

      const result = calculatePortfolioGains(holdings);

      expect(result.totalCurrentValue).toBe(1200);
      expect(result.totalCostBasis).toBe(1000);
      expect(result.unrealizedGainValue).toBe(200);
      expect(result.unrealizedGainPercent).toBe(20); // (200 / 1000) * 100
      expect(result.realizedGainValue).toBe(100);
      expect(result.realizedGainPercent).toBe(25); // Based on calculated cost basis
    });

    it('should aggregate gains across multiple holdings', () => {
      const holdings: HoldingForPortfolioGains[] = [
        {
          marketValue: 1200,
          costBasis: 1000,
          unrealizedGainValue: 200,
          unrealizedGainPercent: 20,
          realizedGainValue: 100,
          realizedGainPercent: 25, // $100 gain on $400 cost basis
        },
        {
          marketValue: 800,
          costBasis: 1000,
          unrealizedGainValue: -200,
          unrealizedGainPercent: -20,
          realizedGainValue: 50,
          realizedGainPercent: 10, // $50 gain on $500 cost basis
        },
        {
          marketValue: 1500,
          costBasis: 1200,
          unrealizedGainValue: 300,
          unrealizedGainPercent: 25,
          realizedGainValue: 0,
          realizedGainPercent: 0,
        },
      ];

      const result = calculatePortfolioGains(holdings);

      // Portfolio totals
      expect(result.totalCurrentValue).toBe(3500); // 1200 + 800 + 1500
      expect(result.totalCostBasis).toBe(3200); // 1000 + 1000 + 1200
      expect(result.unrealizedGainValue).toBe(300); // 200 + (-200) + 300
      expect(result.realizedGainValue).toBe(150); // 100 + 50 + 0

      // Portfolio percentages
      expect(result.unrealizedGainPercent).toBeCloseTo(9.38, 2); // (300 / 3200) * 100
      expect(result.realizedGainPercent).toBeCloseTo(16.67, 2); // (150 / 900) * 100, where 900 is total realized cost basis
    });

    it('should handle holdings with mixed gains and losses', () => {
      const holdings: HoldingForPortfolioGains[] = [
        {
          marketValue: 500,
          costBasis: 1000,
          unrealizedGainValue: -500,
          unrealizedGainPercent: -50,
          realizedGainValue: -100,
          realizedGainPercent: -20, // -$100 loss on $500 cost basis
        },
        {
          marketValue: 1800,
          costBasis: 1000,
          unrealizedGainValue: 800,
          unrealizedGainPercent: 80,
          realizedGainValue: 200,
          realizedGainPercent: 40, // $200 gain on $500 cost basis
        },
      ];

      const result = calculatePortfolioGains(holdings);

      expect(result.totalCurrentValue).toBe(2300);
      expect(result.totalCostBasis).toBe(2000);
      expect(result.unrealizedGainValue).toBe(300); // -500 + 800
      expect(result.realizedGainValue).toBe(100); // -100 + 200
      expect(result.unrealizedGainPercent).toBe(15); // (300 / 2000) * 100
      expect(result.realizedGainPercent).toBe(10); // (100 / 1000) * 100
    });

    it('should handle zero cost basis correctly', () => {
      const holdings: HoldingForPortfolioGains[] = [
        {
          marketValue: 1000,
          costBasis: 0,
          unrealizedGainValue: 1000,
          unrealizedGainPercent: 0, // Should be 0 when cost basis is 0
          realizedGainValue: 0,
          realizedGainPercent: 0,
        },
      ];

      const result = calculatePortfolioGains(holdings);

      expect(result.totalCurrentValue).toBe(1000);
      expect(result.totalCostBasis).toBe(0);
      expect(result.unrealizedGainValue).toBe(1000);
      expect(result.unrealizedGainPercent).toBe(0); // Should be 0 when total cost basis is 0
      expect(result.realizedGainValue).toBe(0);
      expect(result.realizedGainPercent).toBe(0);
    });

    it('should handle holdings with no realized gains', () => {
      const holdings: HoldingForPortfolioGains[] = [
        {
          marketValue: 1200,
          costBasis: 1000,
          unrealizedGainValue: 200,
          unrealizedGainPercent: 20,
          realizedGainValue: 0,
          realizedGainPercent: 0,
        },
        {
          marketValue: 800,
          costBasis: 600,
          unrealizedGainValue: 200,
          unrealizedGainPercent: 33.33,
          realizedGainValue: 0,
          realizedGainPercent: 0,
        },
      ];

      const result = calculatePortfolioGains(holdings);

      expect(result.totalCurrentValue).toBe(2000);
      expect(result.totalCostBasis).toBe(1600);
      expect(result.unrealizedGainValue).toBe(400);
      expect(result.unrealizedGainPercent).toBe(25); // (400 / 1600) * 100
      expect(result.realizedGainValue).toBe(0);
      expect(result.realizedGainPercent).toBe(0);
    });

    it('should calculate correct realized percentage when holdings have different realized percentages', () => {
      const holdings: HoldingForPortfolioGains[] = [
        {
          marketValue: 1000,
          costBasis: 1000,
          unrealizedGainValue: 0,
          unrealizedGainPercent: 0,
          realizedGainValue: 200, // $200 gain on $400 sold shares
          realizedGainPercent: 50,
        },
        {
          marketValue: 2000,
          costBasis: 1500,
          unrealizedGainValue: 500,
          unrealizedGainPercent: 33.33,
          realizedGainValue: 100, // $100 gain on $1000 sold shares
          realizedGainPercent: 10,
        },
      ];

      const result = calculatePortfolioGains(holdings);

      expect(result.totalCurrentValue).toBe(3000);
      expect(result.totalCostBasis).toBe(2500);
      expect(result.unrealizedGainValue).toBe(500);
      expect(result.realizedGainValue).toBe(300);

      // Portfolio unrealized percentage: (500 / 2500) * 100 = 20%
      expect(result.unrealizedGainPercent).toBe(20);

      // Portfolio realized percentage: (300 / total_realized_cost_basis) * 100
      // Where total_realized_cost_basis = 400 + 1000 = 1400
      // So (300 / 1400) * 100 = ~21.43%
      expect(result.realizedGainPercent).toBeCloseTo(21.43, 2);
    });
  });
});
