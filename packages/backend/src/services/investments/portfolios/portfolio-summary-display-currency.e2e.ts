import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import * as helpers from '@tests/helpers';
// USD-based rates served by the mocked rates provider for on-demand date
// lookups. The user's base currency is global.BASE_CURRENCY_CODE (AED), so the
// base→EUR conversion rate is EUR_PER_USD / AED_PER_USD via the USD pivot.
import { AED_PER_USD, EUR_PER_USD } from '@tests/mocks/exchange-rates/data';

// getHoldingValues deduplicates identical requests for 1 second; a summary
// request must outwait that window when earlier setup calls may have primed
// the cache with stale holding values.
const DEDUP_CACHE_MS = 1100;

describe('Portfolio Summary display currency (GET /investments/portfolios/:id/summary)', () => {
  let portfolio: Portfolios;

  beforeEach(async () => {
    portfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Display Currency Portfolio' }),
      raw: true,
    });

    // Deposit 1000 in the user's base currency so ref values are exactly 1000
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Cash Source' }),
      raw: true,
    });

    await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '1000',
        date: '2025-06-15',
      },
      raw: true,
    });
  });

  it('returns base currency when no display currency is set', async () => {
    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(summary.currencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(summary.totalCashInBaseCurrency).toBe('1000.00');
    expect(summary.totalPortfolioValue).toBe('1000.00');
    expect(summary.baseCurrencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(summary.totalPortfolioValueInBaseCurrency).toBe('1000.00');
  });

  it('converts summary values to the display currency at the current rate', async () => {
    await helpers.addUserCurrencyByCode({ code: 'EUR', raw: true });

    const updateResponse = await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: 'EUR' },
    });
    expect(updateResponse.statusCode).toBe(200);

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    const expected = (1000 * EUR_PER_USD) / AED_PER_USD;

    expect(summary.currencyCode).toBe('EUR');
    expect(parseFloat(summary.totalCashInBaseCurrency)).toBeCloseTo(expected, 1);
    expect(parseFloat(summary.availableCashInBaseCurrency)).toBeCloseTo(expected, 1);
    expect(parseFloat(summary.totalPortfolioValue)).toBeCloseTo(expected, 1);
    // Base-currency equivalent stays unconverted for the "~X base" UI line
    expect(summary.baseCurrencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(summary.totalPortfolioValueInBaseCurrency).toBe('1000.00');
  });

  it('keeps base currency values when display currency equals base currency', async () => {
    const updateResponse = await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: global.BASE_CURRENCY_CODE },
    });
    expect(updateResponse.statusCode).toBe(200);

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(summary.currencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(summary.totalCashInBaseCurrency).toBe('1000.00');
    expect(summary.totalPortfolioValue).toBe('1000.00');
  });

  it('converts holdings aggregates and total portfolio value to the display currency', async () => {
    // Security denominated in the base currency so the FX-free numbers are
    // deterministic: costBasis 1000, marketValue 1100, unrealized gain 100.
    const security = await Securities.create({
      symbol: 'SMRY',
      providerSymbol: 'SMRY',
      currencyCode: global.BASE_CURRENCY_CODE,
      providerName: SECURITY_PROVIDER.fmp,
      assetClass: ASSET_CLASS.stocks,
      name: 'Summary Display Currency Test Security',
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

    await helpers.addUserCurrencyByCode({ code: 'EUR', raw: true });
    await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: 'EUR' },
    });

    await helpers.sleep(DEDUP_CACHE_MS);

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    const rate = EUR_PER_USD / AED_PER_USD;

    expect(summary.currencyCode).toBe('EUR');
    expect(parseFloat(summary.totalCurrentValue)).toBeCloseTo(1100 * rate, 1);
    expect(parseFloat(summary.totalCostBasis)).toBeCloseTo(1000 * rate, 1);
    expect(parseFloat(summary.unrealizedGainValue)).toBeCloseTo(100 * rate, 1);
    // The buy (10 × 100) consumed the 1000 cash deposited in beforeEach, so the
    // portfolio value is the holdings market value (1100) alone.
    expect(parseFloat(summary.totalCashInBaseCurrency)).toBeCloseTo(0, 1);
    expect(parseFloat(summary.totalPortfolioValue)).toBeCloseTo(1100 * rate, 1);
    // Base-currency equivalent stays unconverted for the "~X base" UI line
    expect(summary.baseCurrencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(parseFloat(summary.totalPortfolioValueInBaseCurrency)).toBeCloseTo(1100, 1);
  });

  it('falls back to base currency when the display currency is no longer connected to the user', async () => {
    await helpers.addUserCurrencyByCode({ code: 'EUR', raw: true });

    await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: 'EUR' },
    });

    // Disconnect the currency through the API; the portfolio keeps the stale
    // displayCurrencyCode, so the summary must degrade gracefully.
    const deleteResponse = await helpers.makeRequest({
      method: 'delete',
      url: '/user/currency',
      payload: { currencyCode: 'EUR' },
    });
    expect(deleteResponse.statusCode).toBe(200);

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(summary.currencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(summary.totalCashInBaseCurrency).toBe('1000.00');
    expect(summary.totalPortfolioValue).toBe('1000.00');
    expect(summary.totalPortfolioValueInBaseCurrency).toBe('1000.00');
  });

  it('falls back to base currency when no rate exists for the display currency', async () => {
    // SSP exists in the Currencies table (so it can be connected and set as a
    // display currency) but the mocked rate providers serve no USD→SSP rate,
    // so the base→display rate lookup fails and the summary must degrade
    // gracefully to base currency.
    await helpers.addUserCurrencyByCode({ code: 'SSP', raw: true });

    const updateResponse = await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: 'SSP' },
    });
    expect(updateResponse.statusCode).toBe(200);

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(summary.currencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(summary.totalCashInBaseCurrency).toBe('1000.00');
    expect(summary.totalPortfolioValue).toBe('1000.00');
  });

  it('falls back to base currency after resetting display currency to null', async () => {
    await helpers.addUserCurrencyByCode({ code: 'EUR', raw: true });

    await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: 'EUR' },
    });

    const resetResponse = await helpers.updatePortfolio({
      portfolioId: portfolio.id,
      payload: { displayCurrencyCode: null },
    });
    expect(resetResponse.statusCode).toBe(200);

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(summary.currencyCode).toBe(global.BASE_CURRENCY_CODE);
    expect(summary.totalCashInBaseCurrency).toBe('1000.00');
  });
});
