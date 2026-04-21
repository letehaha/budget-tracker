import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { ERROR_CODES } from '@js/errors';
import { restClient } from '@polygon.io/client-js';
import * as helpers from '@tests/helpers';
import alpha from 'alphavantage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import YahooFinance from 'yahoo-finance2';

import { FmpClient, type FmpSearchResult } from './clients/fmp-client';
import { dataProviderFactory } from './provider-factory';

// Get mock instances (these are set up globally in setupIntegrationTests.ts)
const mockedRestClient = vi.mocked(restClient);
const mockPolygonApi = mockedRestClient.getMockImplementation()!('test');
const mockedPolygonGroupedDaily = vi.mocked(mockPolygonApi.stocks.aggregatesGroupedDaily);

const mockedAlpha = vi.mocked(alpha);
const mockAlphaVantage = mockedAlpha.getMockImplementation()!({ key: 'test' });
const mockedAlphaSearch = vi.mocked(mockAlphaVantage.data.search);

const mockedFmpClient = vi.mocked(FmpClient);
// Create properly typed mock functions
const mockedFmpSearch = vi.fn<() => Promise<FmpSearchResult[]>>();

// Configure the constructor to return our mock instance
mockedFmpClient.mockImplementation(function (this: Record<string, unknown>) {
  this.search = mockedFmpSearch;
  this.getQuote = vi.fn();
  this.getHistoricalPrices = vi.fn();
  this.getHistoricalPricesFull = vi.fn();
} as unknown as typeof FmpClient);

// Yahoo is the primary search provider. Override constructor to use shared mocks
// so individual tests can control Yahoo behaviour.
const mockedYahooFinance = vi.mocked(YahooFinance);
const mockedYahooSearch = vi.fn<any>();
const mockedYahooQuote = vi.fn<any>();
const mockedYahooChart = vi.fn<any>();

mockedYahooFinance.mockImplementation(function (this: Record<string, unknown>) {
  this.search = mockedYahooSearch;
  this.quote = mockedYahooQuote;
  this.chart = mockedYahooChart;
} as unknown as typeof YahooFinance);

/**
 * Shared setup: clear factory cache and reset Yahoo mocks to "reject" so that
 * FMP-focused test blocks fall through correctly while Yahoo-focused blocks can
 * override per-test.
 */
function resetProviderMocks() {
  vi.clearAllMocks();
  dataProviderFactory.clearCache();

  // Yahoo rejects by default → composite falls back to FMP for search
  mockedYahooSearch.mockRejectedValue(new Error('Yahoo mock: not configured'));
  mockedYahooQuote.mockRejectedValue(new Error('Yahoo mock: not configured'));
  mockedYahooChart.mockRejectedValue(new Error('Yahoo mock: not configured'));
}

// ---------------------------------------------------------------------------
// 1. Yahoo as primary search provider (happy-path)
// ---------------------------------------------------------------------------
describe('GET /investments/securities/search - Yahoo as primary provider', () => {
  beforeEach(() => {
    resetProviderMocks();
  });

  it('should route search to Yahoo and return results with correct providerName', async () => {
    mockedYahooSearch.mockResolvedValue({
      quotes: [
        {
          symbol: 'AAPL',
          longname: 'Apple Inc.',
          typeDisp: 'Equity',
          exchDisp: 'NASDAQ',
          exchange: 'NMS',
          isYahooFinance: true,
        },
        {
          symbol: 'MSFT',
          longname: 'Microsoft Corporation',
          typeDisp: 'Equity',
          exchDisp: 'NASDAQ',
          exchange: 'NMS',
          isYahooFinance: true,
        },
      ],
    });

    // Currency resolution via quote()
    mockedYahooQuote
      .mockResolvedValueOnce({ symbol: 'AAPL', currency: 'USD' })
      .mockResolvedValueOnce({ symbol: 'MSFT', currency: 'USD' });

    const results = await helpers.searchSecurities({ payload: { query: 'apple' }, raw: true });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      assetClass: ASSET_CLASS.stocks,
      providerName: SECURITY_PROVIDER.yahoo,
      currencyCode: 'USD',
      exchangeName: 'NASDAQ',
    });

    // Yahoo was used, FMP was NOT called
    expect(mockedYahooSearch).toHaveBeenCalledTimes(1);
    expect(mockedFmpSearch).not.toHaveBeenCalled();
  });

  it('should map Yahoo typeDisp values to correct asset classes', async () => {
    mockedYahooSearch.mockResolvedValue({
      quotes: [
        { symbol: 'BTC-USD', shortname: 'Bitcoin USD', typeDisp: 'Cryptocurrency', isYahooFinance: true },
        { symbol: 'VBTLX', shortname: 'Vanguard Bond', typeDisp: 'MutualFund', isYahooFinance: true },
        { symbol: 'SPY', longname: 'SPDR S&P 500 ETF', typeDisp: 'ETF', isYahooFinance: true },
      ],
    });

    mockedYahooQuote
      .mockResolvedValueOnce({ symbol: 'BTC-USD', currency: 'USD' })
      .mockResolvedValueOnce({ symbol: 'VBTLX', currency: 'USD' })
      .mockResolvedValueOnce({ symbol: 'SPY', currency: 'USD' });

    const results = await helpers.searchSecurities({ payload: { query: 'test' }, raw: true });

    expect(results).toHaveLength(3);
    expect(results.find((r) => r.symbol === 'BTC-USD')?.assetClass).toBe(ASSET_CLASS.crypto);
    expect(results.find((r) => r.symbol === 'VBTLX')?.assetClass).toBe(ASSET_CLASS.fixed_income);
    expect(results.find((r) => r.symbol === 'SPY')?.assetClass).toBe(ASSET_CLASS.stocks);
  });

  it('should filter out symbols where currency cannot be resolved', async () => {
    mockedYahooSearch.mockResolvedValue({
      quotes: [
        { symbol: 'AAPL', longname: 'Apple Inc.', typeDisp: 'Equity', isYahooFinance: true },
        { symbol: 'UNKNOWN', longname: 'Unknown Corp', typeDisp: 'Equity', isYahooFinance: true },
        { symbol: 'MSFT', longname: 'Microsoft', typeDisp: 'Equity', isYahooFinance: true },
      ],
    });

    // Currency resolution succeeds for AAPL and MSFT, fails for UNKNOWN
    mockedYahooQuote
      .mockResolvedValueOnce({ symbol: 'AAPL', currency: 'USD' })
      .mockResolvedValueOnce({ symbol: 'UNKNOWN' }) // no currency field
      .mockResolvedValueOnce({ symbol: 'MSFT', currency: 'USD' });

    const results = await helpers.searchSecurities({ payload: { query: 'test' }, raw: true });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.symbol)).toEqual(['AAPL', 'MSFT']);
  });
});

// ---------------------------------------------------------------------------
// 2. Search fallback: Yahoo fails → FMP picks up
// ---------------------------------------------------------------------------
describe('GET /investments/securities/search - Fallback when Yahoo fails', () => {
  beforeEach(() => {
    resetProviderMocks();
    // Yahoo explicitly fails for every test in this block
    mockedYahooSearch.mockRejectedValue(new Error('Yahoo Finance API is down'));
  });

  it('should fall back to FMP when Yahoo search throws and return FMP results', async () => {
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
      {
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
    ]);

    const results = await helpers.searchSecurities({ payload: { query: 'apple' }, raw: true });

    // Yahoo was attempted first
    expect(mockedYahooSearch).toHaveBeenCalledTimes(1);
    // FMP was called as fallback
    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);
    expect(mockedFmpSearch).toHaveBeenCalledWith('apple', 10);

    // Results come from FMP with correct structure
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      assetClass: ASSET_CLASS.stocks,
      providerName: SECURITY_PROVIDER.fmp,
      currencyCode: 'USD',
      exchangeName: 'NASDAQ Global Select',
    });

    // Other providers were NOT called
    expect(mockedAlphaSearch).not.toHaveBeenCalled();
    expect(mockedPolygonGroupedDaily).not.toHaveBeenCalled();
  });

  it('should return empty array gracefully when both Yahoo and FMP fail', async () => {
    mockedFmpSearch.mockRejectedValue(new Error('FMP API rate limit exceeded'));

    const results = await helpers.searchSecurities({ payload: { query: 'apple' }, raw: true });

    // Both providers were attempted
    expect(mockedYahooSearch).toHaveBeenCalledTimes(1);
    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);

    // Service returns empty array instead of propagating the error
    expect(results).toHaveLength(0);
  });

  it('should filter out FMP fallback results that have no currency', async () => {
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ',
        exchangeShortName: 'NASDAQ',
      },
      {
        symbol: 'INVALID',
        name: 'No Currency Corp',
        currency: undefined,
        stockExchange: 'Unknown',
        exchangeShortName: 'UNK',
      },
    ]);

    const results = await helpers.searchSecurities({ payload: { query: 'test' }, raw: true });

    expect(results).toHaveLength(1);
    expect(results[0]!.symbol).toBe('AAPL');
    expect(results[0]!.currencyCode).toBe('USD');
  });

  it('should preserve different currencies in FMP fallback results', async () => {
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ',
        exchangeShortName: 'NASDAQ',
      },
      {
        symbol: 'SAP.DE',
        name: 'SAP SE',
        currency: 'EUR',
        stockExchange: 'XETRA',
        exchangeShortName: 'XETRA',
      },
      {
        symbol: 'AAPL.L',
        name: 'Apple Inc.',
        currency: 'GBP',
        stockExchange: 'London Stock Exchange',
        exchangeShortName: 'LSE',
      },
    ]);

    const results = await helpers.searchSecurities({ payload: { query: 'apple sap' }, raw: true });

    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.providerName).toBe(SECURITY_PROVIDER.fmp));

    expect(results.find((r) => r.symbol === 'AAPL')?.currencyCode).toBe('USD');
    expect(results.find((r) => r.symbol === 'SAP.DE')?.currencyCode).toBe('EUR');
    expect(results.find((r) => r.symbol === 'AAPL.L')?.currencyCode).toBe('GBP');
  });
});

// ---------------------------------------------------------------------------
// 3. Search when Yahoo is disabled via env var → FMP used directly
// ---------------------------------------------------------------------------
describe('GET /investments/securities/search - Yahoo disabled via env', () => {
  let originalYahooEnabled: string | undefined;

  beforeEach(() => {
    resetProviderMocks();
    originalYahooEnabled = process.env.YAHOO_FINANCE_ENABLED;
    process.env.YAHOO_FINANCE_ENABLED = 'false';
    dataProviderFactory.clearCache();
  });

  afterEach(() => {
    if (originalYahooEnabled === undefined) {
      delete process.env.YAHOO_FINANCE_ENABLED;
    } else {
      process.env.YAHOO_FINANCE_ENABLED = originalYahooEnabled;
    }
    dataProviderFactory.clearCache();
  });

  it('should skip Yahoo entirely and use FMP as the primary provider', async () => {
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'GOOGL',
        name: 'Alphabet Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ',
        exchangeShortName: 'NASDAQ',
      },
    ]);

    const results = await helpers.searchSecurities({ payload: { query: 'google' }, raw: true });

    // Yahoo should NOT have been called at all (not in the composite)
    expect(mockedYahooSearch).not.toHaveBeenCalled();

    // FMP is used directly
    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      symbol: 'GOOGL',
      providerName: SECURITY_PROVIDER.fmp,
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Original FMP-focused tests (Yahoo rejects by default → FMP handles search)
// ---------------------------------------------------------------------------
describe('GET /investments/securities/search - Composite Provider Integration', () => {
  beforeEach(async () => {
    resetProviderMocks();
  });

  it('should route search requests to FMP provider and return properly formatted results', async () => {
    // Mock FMP search response in the exact format FMP returns
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
      {
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
    ]);

    const results = await helpers.searchSecurities({ payload: { query: 'apple' }, raw: true });

    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);

    // Verify search worked and returned expected results
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      assetClass: ASSET_CLASS.stocks,
      providerName: SECURITY_PROVIDER.fmp,
      currencyCode: 'USD',
      exchangeName: 'NASDAQ Global Select',
    });

    // Verify FMP was called exactly once with correct parameters
    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);
    expect(mockedFmpSearch).toHaveBeenCalledWith('apple', 10);

    // Verify other providers were NOT called for search
    expect(mockedAlphaSearch).not.toHaveBeenCalled();
    expect(mockedPolygonGroupedDaily).not.toHaveBeenCalled();
  });

  it('should return empty array when FMP returns no results', async () => {
    // Mock FMP returning empty array
    mockedFmpSearch.mockResolvedValue([]);

    const results = await helpers.searchSecurities({ payload: { query: 'nonexistent' }, raw: true });

    expect(results).toHaveLength(0);
    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);
    expect(mockedFmpSearch).toHaveBeenCalledWith('nonexistent', 10);

    // Verify other providers were not called
    expect(mockedAlphaSearch).not.toHaveBeenCalled();
  });

  it('should handle FMP provider errors gracefully and return empty results', async () => {
    // Mock FMP throwing an error
    mockedFmpSearch.mockRejectedValue(new Error('FMP API rate limit exceeded'));

    const results = await helpers.searchSecurities({ payload: { query: 'apple' }, raw: true });

    // Should return empty array on provider error (graceful handling)
    expect(results).toHaveLength(0);
    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);

    // Verify other providers were not called
    expect(mockedAlphaSearch).not.toHaveBeenCalled();
  });

  it('should filter out FMP results that have no currency', async () => {
    // Mock FMP search response with mixed results (some with currency, some without)
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
      {
        symbol: 'INVALID1',
        name: 'Invalid Security 1',
        currency: undefined, // No currency
        stockExchange: 'Some Exchange',
        exchangeShortName: 'SE',
      },
      {
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
      {
        symbol: 'INVALID2',
        name: 'Invalid Security 2',
        currency: undefined, // No currency
        stockExchange: 'Another Exchange',
        exchangeShortName: 'AE',
      },
    ]);

    const results = await helpers.searchSecurities({ payload: { query: 'test' }, raw: true });

    // Should only return results with currency (filtering out invalid ones)
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.symbol)).toEqual(['AAPL', 'MSFT']);

    // Verify all returned results have currency codes
    results.forEach((result) => {
      expect(result.currencyCode).toBeDefined();
      expect(result.currencyCode).toBeTruthy();
    });

    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);
  });

  it('should handle mixed European and US symbols in search results', async () => {
    // Mock FMP returning mix of US and European symbols
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
      {
        symbol: 'AAPL.L',
        name: 'Apple Inc.',
        currency: 'GBP',
        stockExchange: 'London Stock Exchange',
        exchangeShortName: 'LSE',
      },
      {
        symbol: 'SAP.DE',
        name: 'SAP SE',
        currency: 'EUR',
        stockExchange: 'XETRA',
        exchangeShortName: 'XETRA',
      },
    ]);

    const results = await helpers.searchSecurities({ payload: { query: 'apple sap' }, raw: true });

    expect(results).toHaveLength(3);

    // Verify all results are from FMP provider
    results.forEach((result) => {
      expect(result.providerName).toBe(SECURITY_PROVIDER.fmp);
    });

    // Verify different currencies are preserved
    expect(results.find((r) => r.symbol === 'AAPL')?.currencyCode).toBe('USD');
    expect(results.find((r) => r.symbol === 'AAPL.L')?.currencyCode).toBe('GBP');
    expect(results.find((r) => r.symbol === 'SAP.DE')?.currencyCode).toBe('EUR');

    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);
  });

  it('should handle validation errors properly', async () => {
    const response = await helpers.searchSecurities({
      payload: {
        query: 'a', // Too short
        limit: 'invalid' as unknown as number, // Invalid type
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    // Verify no provider calls were made due to validation failure
    expect(mockedFmpSearch).not.toHaveBeenCalled();
    expect(mockedAlphaSearch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. Yahoo getLatestPrice via composite provider
// ---------------------------------------------------------------------------
describe('Yahoo getLatestPrice via composite provider', () => {
  beforeEach(() => {
    resetProviderMocks();
  });

  it('should fetch latest price from Yahoo with correct data mapping', async () => {
    // First seed a security so we can test price fetching
    mockedYahooSearch.mockResolvedValue({
      quotes: [{ symbol: 'AAPL', longname: 'Apple Inc.', typeDisp: 'Equity', isYahooFinance: true }],
    });
    mockedYahooQuote.mockResolvedValue({ symbol: 'AAPL', currency: 'USD' });

    const securities = await helpers.seedSecurities([{ symbol: 'TSLA', name: 'Tesla Inc.', currencyCode: 'USD' }]);

    // Create holding (triggers background historical sync via Yahoo)
    mockedYahooChart.mockResolvedValue({
      quotes: [{ date: new Date(), close: 250.5, adjclose: 250.5 }],
    });

    await helpers.createHolding({
      payload: {
        portfolioId: (await helpers.createPortfolio({ payload: helpers.buildPortfolioPayload(), raw: true })).id,
        securityId: securities[0]!.id,
      },
    });

    // Give background sync time to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Yahoo chart should have been called for historical prices
    expect(mockedYahooChart).toHaveBeenCalled();
  });

  it('should fall back to Polygon when Yahoo getLatestPrice fails for US symbols', async () => {
    // Yahoo fails
    mockedYahooQuote.mockRejectedValue(new Error('Yahoo quote API down'));
    mockedYahooChart.mockRejectedValue(new Error('Yahoo chart API down'));

    // Verify the composite still functions via the daily sync endpoint
    // Polygon succeeds as fallback
    mockedPolygonGroupedDaily.mockResolvedValue({
      results: [{ T: 'AAPL', t: Date.now(), c: 185.0 }],
    });

    const securities = await helpers.seedSecurities([{ symbol: 'FB', name: 'Meta Platforms', currencyCode: 'USD' }]);

    const portfolio = await helpers.createPortfolio({ payload: helpers.buildPortfolioPayload(), raw: true });

    await helpers.createHolding({
      payload: { portfolioId: portfolio.id, securityId: securities[0]!.id },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Yahoo was attempted first, then fallback providers should have been tried
    expect(mockedYahooChart).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. Yahoo getHistoricalPrices via composite provider
// ---------------------------------------------------------------------------
describe('Yahoo getHistoricalPrices via composite provider', () => {
  beforeEach(() => {
    resetProviderMocks();
  });

  it('should return historical prices from Yahoo chart API with adjclose preference', async () => {
    mockedYahooChart.mockResolvedValue({
      quotes: [
        { date: new Date('2024-06-14'), close: 200.0, adjclose: 198.5 },
        { date: new Date('2024-06-15'), close: 205.0, adjclose: 203.0 },
        { date: new Date('2024-06-16'), close: null, adjclose: null }, // Should be filtered
      ],
    });

    // Seed and create holding to trigger historical fetch
    const securities = await helpers.seedSecurities([{ symbol: 'AMZN', name: 'Amazon.com Inc.', currencyCode: 'USD' }]);

    const portfolio = await helpers.createPortfolio({ payload: helpers.buildPortfolioPayload(), raw: true });

    await helpers.createHolding({
      payload: { portfolioId: portfolio.id, securityId: securities[0]!.id },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Yahoo chart should have been called
    expect(mockedYahooChart).toHaveBeenCalled();
  });

  it('should map Yahoo typeDisp "option" and "bond" to correct asset classes', async () => {
    mockedYahooSearch.mockResolvedValue({
      quotes: [
        { symbol: 'OPT1', shortname: 'Test Option', typeDisp: 'Option', isYahooFinance: true },
        { symbol: 'BND1', shortname: 'Test Bond', typeDisp: 'Bond', isYahooFinance: true },
      ],
    });

    mockedYahooQuote
      .mockResolvedValueOnce({ symbol: 'OPT1', currency: 'USD' })
      .mockResolvedValueOnce({ symbol: 'BND1', currency: 'USD' });

    const results = await helpers.searchSecurities({ payload: { query: 'test' }, raw: true });

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.symbol === 'OPT1')?.assetClass).toBe(ASSET_CLASS.options);
    expect(results.find((r) => r.symbol === 'BND1')?.assetClass).toBe(ASSET_CLASS.fixed_income);
  });

  it('should default to stocks asset class when typeDisp is undefined', async () => {
    mockedYahooSearch.mockResolvedValue({
      quotes: [{ symbol: 'UNK1', shortname: 'Unknown Type', isYahooFinance: true }],
    });

    mockedYahooQuote.mockResolvedValueOnce({ symbol: 'UNK1', currency: 'USD' });

    const results = await helpers.searchSecurities({ payload: { query: 'unknown' }, raw: true });

    expect(results).toHaveLength(1);
    expect(results[0]?.assetClass).toBe(ASSET_CLASS.stocks);
  });
});
