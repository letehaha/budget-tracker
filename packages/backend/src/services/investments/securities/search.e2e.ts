import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

import { FmpClient, type FmpSearchResult } from '../data-providers/clients/fmp-client';

// Get the globally mocked FMP client (set up in setupIntegrationTests.ts)
const mockedFmpClient = jest.mocked(FmpClient);
const mockedFmpSearch = jest.fn<() => Promise<FmpSearchResult[]>>();

// Configure the FMP client mock to return our controlled search function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
mockedFmpClient.mockImplementation(() => ({ search: mockedFmpSearch }) as any);

describe('GET /investments/securities/search', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  it('should search for securities and return properly formatted results', async () => {
    // Mock FMP client response in FMP format
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
      {
        symbol: 'GOOG',
        name: 'Alphabet Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
    ]);

    const results = await helpers.searchSecurities({ payload: { query: 'apple' }, raw: true });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      assetClass: ASSET_CLASS.stocks,
      providerName: SECURITY_PROVIDER.fmp,
      currencyCode: 'USD',
      exchangeName: 'NASDAQ Global Select',
    });

    // Verify FMP client was called with correct parameters
    expect(mockedFmpSearch).toHaveBeenCalledWith('apple', 10);
    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);
  });

  it('should return empty array when no securities found', async () => {
    // Mock FMP client returning no results
    mockedFmpSearch.mockResolvedValue([]);

    const results = await helpers.searchSecurities({ payload: { query: 'nonexistent' }, raw: true });

    expect(results).toHaveLength(0);
    expect(mockedFmpSearch).toHaveBeenCalledWith('nonexistent', 10);
    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);
  });

  it('should handle provider errors gracefully', async () => {
    // Mock FMP client throwing an error
    mockedFmpSearch.mockRejectedValue(new Error('FMP API error'));

    const results = await helpers.searchSecurities({ payload: { query: 'apple' }, raw: true });

    // Service should return empty array on provider error (graceful degradation)
    expect(results).toHaveLength(0);
    expect(mockedFmpSearch).toHaveBeenCalledWith('apple', 10);
    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);
  });

  it('should handle validation errors properly', async () => {
    // Test invalid input validation
    const response = await helpers.searchSecurities({
      payload: {
        query: 'a', // Too short (< 2 characters)
        limit: 'test-non-number' as unknown as number,
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    // Verify FMP client was not called due to validation failure
    expect(mockedFmpSearch).not.toHaveBeenCalled();
  });

  it('should handle short query gracefully', async () => {
    // Test the service's built-in validation for short queries
    const results = await helpers.searchSecurities({ payload: { query: 'a' }, raw: true });

    // Service should return empty array for queries < 2 characters
    expect(results).toHaveLength(0);

    // FMP client should not be called for short queries
    expect(mockedFmpSearch).not.toHaveBeenCalled();
  });

  it('should apply limit parameter correctly', async () => {
    // Mock FMP client returning 5 results
    const mockResults = Array.from({ length: 5 }, (_, i) => ({
      symbol: `TEST${i + 1}`,
      name: `Test Security ${i + 1}`,
      currency: 'USD',
      stockExchange: 'Test Exchange',
      exchangeShortName: 'TEST',
    }));

    mockedFmpSearch.mockResolvedValue(mockResults);

    // Request with limit of 3
    const results = await helpers.searchSecurities({
      payload: { query: 'test', limit: 3 },
      raw: true,
    });

    // Service should apply the limit
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.symbol)).toEqual(['TEST1', 'TEST2', 'TEST3']);

    expect(mockedFmpSearch).toHaveBeenCalledWith('test', 10);
    expect(mockedFmpSearch).toHaveBeenCalledTimes(1);
  });
});
