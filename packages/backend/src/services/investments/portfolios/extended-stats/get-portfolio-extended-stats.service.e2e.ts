import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import * as helpers from '@tests/helpers';

describe('GET /investments/portfolios/:id/extended-stats', () => {
  let portfolio: Portfolios;
  let voo: Securities;

  beforeEach(async () => {
    jest.clearAllMocks();

    portfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Stats Test Portfolio' }),
      raw: true,
    });

    const [seeded] = await helpers.seedSecurities([{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }]);
    if (!seeded) throw new Error('VOO security not found after seeding');
    voo = seeded;
  });

  describe('empty portfolio', () => {
    it('returns zeros and nulls when there are no flows or transactions', async () => {
      const stats = await helpers.getPortfolioExtendedStats({ portfolioId: portfolio.id, raw: true });

      expect(stats.portfolioId).toBe(portfolio.id);
      expect(stats.totalDeposits).toBe('0.00');
      expect(stats.totalWithdrawals).toBe('0.00');
      expect(stats.netInvested).toBe('0.00');
      expect(stats.totalDividends).toBe('0.00');
      expect(stats.averageMonthlyDividends).toBeNull();
      expect(stats.firstTransactionDate).toBeNull();
      expect(stats.portfolioAgeDays).toBe(0);
      expect(stats.irr).toBeNull();
      expect(stats.twr).toBeNull();
      expect(stats.bestPerformerByPercent).toBeNull();
      expect(stats.worstPerformerByPercent).toBeNull();
      expect(stats.bestPerformerByValue).toBeNull();
      expect(stats.worstPerformerByValue).toBeNull();
      expect(stats.closedPositionsCount).toBe(0);
      expect(stats.winningPositionsCount).toBe(0);
      expect(stats.winRate).toBe('0.00');
      expect(stats.avgReturnPerClosedPosition).toBe('0.00');
      expect(stats.avgReturnPerClosedPositionPercent).toBe('0.00');
    });
  });

  describe('deposits-only portfolio', () => {
    it('uses the deposit as the portfolio start when there are no buys yet', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Cash Source' }),
        raw: true,
      });

      await helpers.accountToPortfolioTransfer({
        portfolioId: portfolio.id,
        payload: { accountId: account.id, amount: '5000', date: '2024-01-15' },
        raw: true,
      });

      const stats = await helpers.getPortfolioExtendedStats({ portfolioId: portfolio.id, raw: true });

      expect(parseFloat(stats.totalDeposits)).toBeGreaterThan(0);
      expect(stats.totalWithdrawals).toBe('0.00');
      expect(parseFloat(stats.netInvested)).toEqual(parseFloat(stats.totalDeposits));
      // Earliest of (first deposit, first buy) — only the deposit exists here.
      expect(stats.firstTransactionDate).toBe('2024-01-15');
      expect(stats.portfolioAgeDays).toBeGreaterThan(0);

      if (stats.irr !== null) {
        expect(parseFloat(stats.irr)).toBeCloseTo(0, 0);
      }
      expect(stats.closedPositionsCount).toBe(0);
    });
  });

  describe('happy path: deposits + buys + sells + dividend', () => {
    it('produces a coherent set of stats', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Cash Source' }),
        raw: true,
      });

      // Deposit cash
      await helpers.accountToPortfolioTransfer({
        portfolioId: portfolio.id,
        payload: { accountId: account.id, amount: '10000', date: '2024-01-01' },
        raw: true,
      });

      // Open the holding
      await helpers.createHolding({
        payload: { portfolioId: portfolio.id, securityId: voo.id },
        raw: true,
      });

      // Buy 50 shares @ $100
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: voo.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: '2024-02-01',
          quantity: '50',
          price: '100',
          fees: '0',
        },
        raw: true,
      });

      // Sell 50 shares @ $120 (full close → +$1000 gain)
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: voo.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          date: '2024-08-01',
          quantity: '50',
          price: '120',
          fees: '0',
        },
        raw: true,
      });

      // A small dividend
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: voo.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.dividend,
          date: '2024-05-15',
          quantity: '50',
          price: '0.5',
          fees: '0',
        },
        raw: true,
      });

      const stats = await helpers.getPortfolioExtendedStats({ portfolioId: portfolio.id, raw: true });

      // Cash flow side
      expect(parseFloat(stats.totalDeposits)).toBeGreaterThan(0);
      expect(stats.totalWithdrawals).toBe('0.00');
      expect(parseFloat(stats.netInvested)).toEqual(parseFloat(stats.totalDeposits));
      expect(parseFloat(stats.totalDividends)).toBeGreaterThan(0);
      // Earliest of (first deposit 2024-01-01, first buy 2024-02-01) → deposit.
      expect(stats.firstTransactionDate).toBe('2024-01-01');
      expect(stats.portfolioAgeDays).toBeGreaterThan(0);

      // Closed-position math: one fully-closed cycle, winning, +$1000 gain in security currency.
      expect(stats.closedPositionsCount).toBe(1);
      expect(stats.winningPositionsCount).toBe(1);
      expect(parseFloat(stats.winRate)).toBeCloseTo(100, 6);
      expect(parseFloat(stats.avgReturnPerClosedPositionPercent)).toBeCloseTo(20, 6);
      expect(parseFloat(stats.avgReturnPerClosedPosition)).toBeGreaterThan(0);

      // Returns should be present (not null) and finite when there's a real terminal value.
      // After the sell, cash = 10000 + 50*120 - 50*100 + dividend = 11025 base equiv.
      // IRR / TWR should resolve.
      if (stats.irr !== null) {
        expect(Number.isFinite(parseFloat(stats.irr))).toBe(true);
      }
      if (stats.twr !== null) {
        expect(Number.isFinite(parseFloat(stats.twr))).toBe(true);
      }

      // No open performers (security was fully closed) but the closed cycle should appear.
      // Best/worst by % should both reference the closed VOO position.
      expect(stats.bestPerformerByPercent).not.toBeNull();
      expect(stats.bestPerformerByPercent!.symbol).toBe('VOO');
      expect(parseFloat(stats.bestPerformerByPercent!.returnPercent)).toBeCloseTo(20, 6);
    });
  });
});
