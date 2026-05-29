import { ASSET_CLASS, INVESTMENT_TRANSACTION_CATEGORY, SECURITY_PROVIDER } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import * as helpers from '@tests/helpers';
import { format, parseISO, subDays } from 'date-fns';

const today = () => format(new Date(), 'yyyy-MM-dd');
const daysAgo = ({ days }: { days: number }) => format(subDays(new Date(), days), 'yyyy-MM-dd');

/**
 * Creates a stock security denominated in the test base currency (AED) so that
 * the FX rate is 1:1 and the time-weighted return is driven purely by the
 * seeded prices — keeping the assertions deterministic.
 */
const createBaseCurrencySecurity = async ({ symbol }: { symbol: string }) =>
  Securities.create({
    symbol,
    providerSymbol: symbol,
    currencyCode: global.BASE_CURRENCY_CODE,
    providerName: SECURITY_PROVIDER.fmp,
    assetClass: ASSET_CLASS.stocks,
    name: `${symbol} Test Security`,
  });

const seedPrices = async ({
  securityId,
  points,
}: {
  securityId: string;
  points: Array<{ date: string; price: string }>;
}) => {
  // Drain the background price sync triggered by createHolding, then replace the
  // pricing rows with exactly the points we control.
  await helpers.sleep(200);
  await SecurityPricing.destroy({ where: { securityId } });
  for (const point of points) {
    await SecurityPricing.create({
      securityId,
      date: parseISO(point.date),
      priceClose: point.price,
      source: SECURITY_PROVIDER.fmp,
    });
  }
};

describe('GET /investments/portfolios/annualized-returns', () => {
  it('returns an empty array when the user has no portfolios', async () => {
    const result = await helpers.getPortfoliosAnnualizedReturns({ raw: true });
    expect(result).toEqual([]);
  });

  describe('with portfolios', () => {
    let portfolio: Portfolios;

    beforeEach(async () => {
      portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Returns Test Portfolio' }),
        raw: true,
      });
    });

    it('reports not-enough-history for a portfolio with no transactions', async () => {
      const result = await helpers.getPortfoliosAnnualizedReturns({ raw: true });

      const entry = result.find((r) => r.portfolioId === portfolio.id)!;
      expect(entry).toBeDefined();
      expect(entry.annualizedReturn).toBeNull();
      expect(entry.hasEnoughHistory).toBe(false);
      expect(entry.startDate).toBeNull();
      expect(entry.periodDays).toBe(0);
      expect(entry.currencyCode).toBe(global.BASE_CURRENCY_CODE);
    });

    it('reports not-enough-history when the history is shorter than the minimum', async () => {
      const security = await createBaseCurrencySecurity({ symbol: 'SHORT' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: security.id } });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: security.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: daysAgo({ days: 30 }),
          quantity: '1',
          price: '100',
        },
        raw: true,
      });
      await seedPrices({
        securityId: security.id,
        points: [
          { date: daysAgo({ days: 30 }), price: '100' },
          { date: today(), price: '150' },
        ],
      });

      const result = await helpers.getPortfoliosAnnualizedReturns({ raw: true });
      const entry = result.find((r) => r.portfolioId === portfolio.id)!;

      expect(entry.annualizedReturn).toBeNull();
      expect(entry.hasEnoughHistory).toBe(false);
      expect(entry.startDate).toBe(daysAgo({ days: 30 }));
      expect(entry.periodDays).toBeGreaterThan(0);
    });

    it('computes the annualized time-weighted return over a full year', async () => {
      const security = await createBaseCurrencySecurity({ symbol: 'YEAR' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: security.id } });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: security.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: daysAgo({ days: 365 }),
          quantity: '1',
          price: '100',
        },
        raw: true,
      });
      // Bought at 100, worth 120 today → +20% over exactly 365 days → ~20%/yr.
      await seedPrices({
        securityId: security.id,
        points: [
          { date: daysAgo({ days: 365 }), price: '100' },
          { date: today(), price: '120' },
        ],
      });

      const result = await helpers.getPortfoliosAnnualizedReturns({ raw: true });
      const entry = result.find((r) => r.portfolioId === portfolio.id)!;

      expect(entry.hasEnoughHistory).toBe(true);
      expect(entry.startDate).toBe(daysAgo({ days: 365 }));
      expect(entry.periodDays).toBe(365);
      expect(entry.annualizedReturn).toBeCloseTo(20, 1);
      expect(entry.currencyCode).toBe(global.BASE_CURRENCY_CODE);
    });

    it('chains sub-period returns and excludes mid-period contributions', async () => {
      // Two buys at different prices. TWR must measure the holdings' performance
      // only, treating the second buy as new capital (not a return) — otherwise
      // the contribution would leak into the figure.
      const security = await createBaseCurrencySecurity({ symbol: 'CHAIN' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: security.id } });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: security.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: daysAgo({ days: 365 }),
          quantity: '1',
          price: '100',
        },
        raw: true,
      });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: security.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: daysAgo({ days: 182 }),
          quantity: '1',
          price: '110',
        },
        raw: true,
      });
      await seedPrices({
        securityId: security.id,
        points: [
          { date: daysAgo({ days: 365 }), price: '100' },
          { date: daysAgo({ days: 182 }), price: '110' },
          { date: today(), price: '121' },
        ],
      });

      const result = await helpers.getPortfoliosAnnualizedReturns({ raw: true });
      const entry = result.find((r) => r.portfolioId === portfolio.id)!;

      // Sub-period 1: 100 → 110 (+10%). Sub-period 2: 220 → 242 on 2 shares
      // (+10%). Chained: 1.1 × 1.1 = 1.21 → ~21%/yr. A naive total-return metric
      // that counted the +110 contribution as growth would land near ~15%, so
      // the 21% result proves the contribution is excluded.
      expect(entry.hasEnoughHistory).toBe(true);
      expect(entry.annualizedReturn).toBeCloseTo(21, 0);
    });

    it('does not treat a partial sell as a loss', async () => {
      // Selling shares is a withdrawal of capital, not a negative return. The
      // sub-period spanning the sell must stay flat (price unchanged), so the
      // whole return comes from the pre-sell appreciation.
      const security = await createBaseCurrencySecurity({ symbol: 'PSELL' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: security.id } });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: security.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: daysAgo({ days: 365 }),
          quantity: '2',
          price: '100',
        },
        raw: true,
      });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: security.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          date: daysAgo({ days: 182 }),
          quantity: '1',
          price: '150',
        },
        raw: true,
      });
      await seedPrices({
        securityId: security.id,
        points: [
          { date: daysAgo({ days: 365 }), price: '100' },
          { date: daysAgo({ days: 182 }), price: '150' },
          { date: today(), price: '150' },
        ],
      });

      const result = await helpers.getPortfoliosAnnualizedReturns({ raw: true });
      const entry = result.find((r) => r.portfolioId === portfolio.id)!;

      // Sub-period 1: 200 → 300 on 2 shares (+50%). Sub-period 2: 1 share held
      // flat at 150 (0%). Chained: 1.5 × 1.0 = 1.5 → ~50%/yr. The sell itself
      // must not register as a drop.
      expect(entry.hasEnoughHistory).toBe(true);
      expect(entry.annualizedReturn).toBeCloseTo(50, 0);
    });

    it('reports each portfolio independently, including negative returns', async () => {
      // `portfolio` (from beforeEach) gains; a second portfolio loses. Both must
      // appear in one response with their own independent figures — proving the
      // per-portfolio grouping doesn't leak transactions across portfolios.
      const gainSecurity = await createBaseCurrencySecurity({ symbol: 'GAIN' });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: gainSecurity.id } });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: gainSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: daysAgo({ days: 365 }),
          quantity: '1',
          price: '100',
        },
        raw: true,
      });
      await seedPrices({
        securityId: gainSecurity.id,
        points: [
          { date: daysAgo({ days: 365 }), price: '100' },
          { date: today(), price: '120' },
        ],
      });

      const losingPortfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Losing Portfolio' }),
        raw: true,
      });
      const loseSecurity = await createBaseCurrencySecurity({ symbol: 'LOSE' });
      await helpers.createHolding({ payload: { portfolioId: losingPortfolio.id, securityId: loseSecurity.id } });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: losingPortfolio.id,
          securityId: loseSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: daysAgo({ days: 365 }),
          quantity: '1',
          price: '100',
        },
        raw: true,
      });
      await seedPrices({
        securityId: loseSecurity.id,
        points: [
          { date: daysAgo({ days: 365 }), price: '100' },
          { date: today(), price: '80' },
        ],
      });

      const result = await helpers.getPortfoliosAnnualizedReturns({ raw: true });
      const gain = result.find((r) => r.portfolioId === portfolio.id)!;
      const lose = result.find((r) => r.portfolioId === losingPortfolio.id)!;

      // 100 → 120 over a year ≈ +20%/yr; 100 → 80 ≈ -20%/yr.
      expect(gain.annualizedReturn).toBeCloseTo(20, 0);
      expect(lose.annualizedReturn).toBeCloseTo(-20, 0);
    });

    it('does not inflate the return when a holding is unpriced at its buy date', async () => {
      // Reproduces the real-world case: a security whose price history does not
      // reach back to the (back-dated) buy. The unpriced holding must fall back
      // to its cost basis at the buy boundary — otherwise it is valued at 0 when
      // bought and at full price later, injecting a phantom return.
      const buyDay = daysAgo({ days: 300 });

      const priced = await createBaseCurrencySecurity({ symbol: 'PRICED' });
      const latePriced = await createBaseCurrencySecurity({ symbol: 'LATEPRICE' });

      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: priced.id } });
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: latePriced.id } });

      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: priced.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: buyDay,
          quantity: '1',
          price: '100',
        },
        raw: true,
      });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: latePriced.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: buyDay,
          quantity: '1',
          price: '100',
        },
        raw: true,
      });

      // PRICED has a price at the buy date; LATEPRICE only gets a price today
      // (none at or before the buy). Both end flat-ish, so the true return is
      // small: cost basis 200 → value 210 over 300 days ≈ 6%/yr.
      await seedPrices({
        securityId: priced.id,
        points: [
          { date: buyDay, price: '100' },
          { date: today(), price: '110' },
        ],
      });
      await seedPrices({ securityId: latePriced.id, points: [{ date: today(), price: '100' }] });

      const result = await helpers.getPortfoliosAnnualizedReturns({ raw: true });
      const entry = result.find((r) => r.portfolioId === portfolio.id)!;

      expect(entry.hasEnoughHistory).toBe(true);
      // Must be the real ~6%/yr, NOT the phantom ~140%/yr the skip-when-unpriced
      // bug produced.
      expect(entry.annualizedReturn).toBeLessThan(20);
      expect(entry.annualizedReturn).toBeCloseTo(6.1, 0);
    });
  });
});
