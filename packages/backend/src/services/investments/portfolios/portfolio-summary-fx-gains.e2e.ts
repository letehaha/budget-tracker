import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types';
import { afterEach, describe, expect, it } from '@jest/globals';
import ExchangeRates from '@models/exchange-rates.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import { API_LAYER_BASE_CURRENCY_CODE } from '@services/exchange-rates/constants';
import * as helpers from '@tests/helpers';
import { AED_PER_USD } from '@tests/mocks/exchange-rates/data';

// getHoldingValues deduplicates identical requests for 1 second; a summary
// request must outwait that window when earlier setup calls may have primed
// the cache with stale holding values.
const DEDUP_CACHE_MS = 1100;

const BUY_DATE = '2024-03-15';
const BUY_DATE_RATE_DATE = new Date(`${BUY_DATE}T00:00:00.000Z`);
// The whole point of the fixture: USD buys 8 base units on the trade date but
// only ~3.67 today, so a cost basis frozen at the trade-date rate and one
// converted at today's rate land far apart — and on opposite sides of zero.
const BUY_DATE_USD_TO_BASE = 8;
const TODAY_USD_TO_BASE = AED_PER_USD;

const seedHoldingWithHistoricalBuy = async ({ currencyCode, symbol }: { currencyCode: string; symbol: string }) => {
  const portfolio = await helpers.createPortfolio({
    payload: helpers.buildPortfolioPayload({ name: `FX Gains Portfolio ${symbol}` }),
    raw: true,
  });

  const security = await Securities.create({
    symbol,
    providerSymbol: symbol,
    currencyCode,
    providerName: SECURITY_PROVIDER.fmp,
    assetClass: ASSET_CLASS.stocks,
    name: `FX Gains Test Security ${symbol}`,
  });

  await helpers.createHolding({
    payload: { portfolioId: portfolio.id, securityId: security.id },
  });

  // Fund the trade in the holding's own currency so the buy leaves the
  // portfolio at exactly zero cash and the summary reports holdings only.
  await helpers.updatePortfolioBalance({
    portfolioId: portfolio.id,
    currencyCode,
    setAvailableCash: '1000',
    setTotalCash: '1000',
  });

  await helpers.createInvestmentTransaction({
    payload: {
      portfolioId: portfolio.id,
      securityId: security.id,
      date: BUY_DATE,
      quantity: '10',
      price: '100',
      fees: '0',
    },
  });

  // Drain the background price sync triggered by createHolding, then replace
  // the pricing rows with exactly the point we control.
  await helpers.sleep(200);
  await SecurityPricing.destroy({ where: { securityId: security.id } });
  await SecurityPricing.create({
    securityId: security.id,
    date: new Date(),
    priceClose: '120',
    source: SECURITY_PROVIDER.fmp,
  });

  return { portfolio, security };
};

describe('Portfolio Summary FX gains (GET /investments/portfolios/:id/summary)', () => {
  // ExchangeRates survives the global truncation (it is seed data), and the
  // global cleanup only drops today-and-later rows, so the trade-date row
  // seeded here has to be removed by hand.
  afterEach(async () => {
    await ExchangeRates.destroy({
      where: {
        baseCode: API_LAYER_BASE_CURRENCY_CODE,
        quoteCode: global.BASE_CURRENCY_CODE,
        date: BUY_DATE_RATE_DATE,
      },
    });
  });

  it('converts cost basis at the current rate when the holding currency moved since the buy', async () => {
    await ExchangeRates.create({
      baseCode: API_LAYER_BASE_CURRENCY_CODE,
      quoteCode: global.BASE_CURRENCY_CODE,
      rate: BUY_DATE_USD_TO_BASE,
      date: BUY_DATE_RATE_DATE,
    });

    const { portfolio } = await seedHoldingWithHistoricalBuy({ currencyCode: 'USD', symbol: 'FXGN' });

    const holdings = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: {},
      raw: true,
    });

    expect(holdings).toHaveLength(1);
    const holding = holdings[0]!;

    // Fail fast: without the trade-date rate actually applied there is no FX
    // move between the two dates and nothing left to reproduce.
    expect(parseFloat(holding.refCostBasis)).toBeCloseTo(1000 * BUY_DATE_USD_TO_BASE, 1);
    expect(parseFloat(holding.costBasis)).toBeCloseTo(1000, 1);
    expect(parseFloat(holding.marketValue!)).toBeCloseTo(1200, 1);
    expect(parseFloat(holding.unrealizedGainValue!)).toBeCloseTo(200, 1);

    await helpers.sleep(DEDUP_CACHE_MS);

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(summary.currencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(parseFloat(summary.totalCurrentValue)).toBeCloseTo(1200 * TODAY_USD_TO_BASE, 1);
    expect(parseFloat(summary.totalCostBasis)).toBeCloseTo(1000 * TODAY_USD_TO_BASE, 1);
    expect(parseFloat(summary.unrealizedGainValue)).toBeCloseTo(200 * TODAY_USD_TO_BASE, 1);
    expect(Math.sign(parseFloat(summary.unrealizedGainValue))).toBe(Math.sign(200));
  });

  it('reports the same values natively when the holding currency is the base currency', async () => {
    const { portfolio } = await seedHoldingWithHistoricalBuy({
      currencyCode: global.BASE_CURRENCY_CODE,
      symbol: 'FXBS',
    });

    await helpers.sleep(DEDUP_CACHE_MS);

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(summary.currencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(summary.totalCurrentValue).toBe('1200.00');
    expect(summary.totalCostBasis).toBe('1000.00');
    expect(summary.unrealizedGainValue).toBe('200.00');
    expect(summary.totalCashInBaseCurrency).toBe('0.00');
  });
});
