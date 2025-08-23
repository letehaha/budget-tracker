import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import { restClient } from '@polygon.io/client-js';
import * as helpers from '@tests/helpers';
import alpha from 'alphavantage';

import { FmpClient, type FmpSearchResult } from './clients/fmp-client';

// Get mock instances (these are set up globally in setupIntegrationTests.ts)
const mockedRestClient = jest.mocked(restClient);
const mockPolygonApi = mockedRestClient.getMockImplementation()!('test');
const mockedPolygonGroupedDaily = jest.mocked(mockPolygonApi.stocks.aggregatesGroupedDaily);

const mockedAlpha = jest.mocked(alpha);
const mockAlphaVantage = mockedAlpha.getMockImplementation()!({ key: 'test' });
const mockedAlphaSearch = jest.mocked(mockAlphaVantage.data.search);

const mockedFmpClient = jest.mocked(FmpClient);
// Create properly typed mock functions
const mockedFmpSearch = jest.fn<() => Promise<FmpSearchResult[]>>();

// Configure the constructor to return our mock instance
mockedFmpClient.mockImplementation(
  () =>
    ({
      search: mockedFmpSearch,
      getQuote: jest.fn(),
      getHistoricalPrices: jest.fn(),
      getHistoricalPricesFull: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
);

describe('GET /investments/securities/search - Composite Provider Integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
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
