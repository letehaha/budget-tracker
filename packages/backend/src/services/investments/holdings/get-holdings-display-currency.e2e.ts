import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import * as helpers from '@tests/helpers';
// USD-based rates served by the mocked rates provider for on-demand date
// lookups. The security is denominated in the base currency (AED), so the
// native→EUR conversion rate is EUR_PER_USD / AED_PER_USD via the USD pivot.
import { AED_PER_USD, EUR_PER_USD } from '@tests/mocks/exchange-rates/data';

const AED_TO_EUR = EUR_PER_USD / AED_PER_USD;

// getHoldingValues deduplicates identical requests for 1 second; consecutive
// getHoldings calls in the same test must outwait that window to observe the
// effect of a displayCurrencyCode change.
const DEDUP_CACHE_MS = 1100;

describe('Holdings display currency (GET /investments/portfolios/:id/holdings)', () => {
  let portfolio: Portfolios;
  let security: Securities;

  beforeEach(async () => {
    portfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Holdings Display Currency Portfolio' }),
      raw: true,
    });

    // Security denominated in the base currency so the FX-free numbers are
    // deterministic: costBasis 1000, marketValue 1100, unrealized gain 100.
    security = await Securities.create({
      symbol: 'DSPL',
      providerSymbol: 'DSPL',
      currencyCode: global.BASE_CURRENCY_CODE,
      providerName: SECURITY_PROVIDER.fmp,
      assetClass: ASSET_CLASS.stocks,
      name: 'Display Currency Test Security',
    });

    await helpers.createHolding({
      payload: { portfolioId: portfolio.id, securityId: security.id },
    });

    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: security.id,
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
      priceClose: '110',
      source: SECURITY_PROVIDER.fmp,
    });
  });

  it('returns no display fields when the portfolio has no display currency', async () => {
    const holdings = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: {},
      raw: true,
    });

    expect(holdings).toHaveLength(1);
    const holding = holdings[0]!;

    expect(parseFloat(holding.marketValue!)).toBeCloseTo(1100, 1);
    expect(parseFloat(holding.costBasis)).toBeCloseTo(1000, 1);
    expect(holding.displayCurrencyCode).toBeUndefined();
    expect(holding.displayMarketValue).toBeUndefined();
    expect(holding.displayCostBasis).toBeUndefined();
  });

  it('returns money values converted to the display currency', async () => {
    await helpers.addUserCurrencyByCode({ code: 'EUR', raw: true });
    await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: 'EUR' },
    });

    await helpers.sleep(DEDUP_CACHE_MS);

    const holdings = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: {},
      raw: true,
    });

    expect(holdings).toHaveLength(1);
    const holding = holdings[0]!;

    // Native values untouched
    expect(parseFloat(holding.marketValue!)).toBeCloseTo(1100, 1);
    expect(parseFloat(holding.costBasis)).toBeCloseTo(1000, 1);

    expect(holding.displayCurrencyCode).toBe('EUR');
    expect(parseFloat(holding.displayMarketValue!)).toBeCloseTo(1100 * AED_TO_EUR, 1);
    expect(parseFloat(holding.displayCostBasis!)).toBeCloseTo(1000 * AED_TO_EUR, 1);
    expect(parseFloat(holding.displayUnrealizedGainValue!)).toBeCloseTo(100 * AED_TO_EUR, 1);
    expect(parseFloat(holding.displayRealizedGainValue!)).toBeCloseTo(0, 2);
  });

  it('omits display fields when the display currency is no longer connected to the user', async () => {
    await helpers.addUserCurrencyByCode({ code: 'EUR', raw: true });
    await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: 'EUR' },
    });

    // Disconnect the currency through the API; the portfolio keeps the stale
    // displayCurrencyCode, so holdings must degrade gracefully.
    const deleteResponse = await helpers.makeRequest({
      method: 'delete',
      url: '/user/currency',
      payload: { currencyCode: 'EUR' },
    });
    expect(deleteResponse.statusCode).toBe(200);

    await helpers.sleep(DEDUP_CACHE_MS);

    const holdings = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: {},
      raw: true,
    });

    expect(holdings).toHaveLength(1);
    const holding = holdings[0]!;

    // Native values untouched
    expect(parseFloat(holding.marketValue!)).toBeCloseTo(1100, 1);
    expect(parseFloat(holding.costBasis)).toBeCloseTo(1000, 1);

    expect(holding.displayCurrencyCode).toBeUndefined();
    expect(holding.displayMarketValue).toBeUndefined();
    expect(holding.displayCostBasis).toBeUndefined();
    expect(holding.displayUnrealizedGainValue).toBeUndefined();
    expect(holding.displayRealizedGainValue).toBeUndefined();
  });

  it('omits display fields when no rate exists for the display currency', async () => {
    // SSP exists in the Currencies table (so it can be connected and set as a
    // display currency) but the mocked rate providers serve no USD→SSP rate,
    // so the native→display rate lookup fails and holdings must degrade
    // gracefully by omitting display fields.
    await helpers.addUserCurrencyByCode({ code: 'SSP', raw: true });
    await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: 'SSP' },
    });

    await helpers.sleep(DEDUP_CACHE_MS);

    const holdings = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: {},
      raw: true,
    });

    expect(holdings).toHaveLength(1);
    const holding = holdings[0]!;

    // Native values untouched
    expect(parseFloat(holding.marketValue!)).toBeCloseTo(1100, 1);
    expect(parseFloat(holding.costBasis)).toBeCloseTo(1000, 1);

    expect(holding.displayCurrencyCode).toBeUndefined();
    expect(holding.displayMarketValue).toBeUndefined();
    expect(holding.displayCostBasis).toBeUndefined();
    expect(holding.displayUnrealizedGainValue).toBeUndefined();
    expect(holding.displayRealizedGainValue).toBeUndefined();
  });

  it('returns identity-converted values when display currency equals the holding currency', async () => {
    await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: global.BASE_CURRENCY_CODE },
    });

    await helpers.sleep(DEDUP_CACHE_MS);

    const holdings = await helpers.getHoldings({
      portfolioId: portfolio.id,
      payload: {},
      raw: true,
    });

    expect(holdings).toHaveLength(1);
    const holding = holdings[0]!;

    expect(holding.displayCurrencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(parseFloat(holding.displayMarketValue!)).toBeCloseTo(1100, 1);
    expect(parseFloat(holding.displayCostBasis!)).toBeCloseTo(1000, 1);
    expect(parseFloat(holding.displayUnrealizedGainValue!)).toBeCloseTo(100, 1);
  });
});
