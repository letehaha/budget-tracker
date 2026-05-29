import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import Coingecko from '@coingecko/coingecko-typescript';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FmpClient, type FmpSearchResult } from '../data-providers/clients/fmp-client';
import { dataProviderFactory } from '../data-providers/provider-factory';

// Get the globally mocked FMP client (set up in setupIntegrationTests.ts)
const mockedFmpClient = vi.mocked(FmpClient);
const mockedFmpSearch = vi.fn<() => Promise<FmpSearchResult[]>>();

// Configure the FMP client mock to return our controlled search function
mockedFmpClient.mockImplementation(function (this: Record<string, unknown>) {
  this.search = mockedFmpSearch;
} as unknown as typeof FmpClient);

// CoinGecko global mock (registered in setupIntegrationTests.ts). We rebind a
// fresh implementation before every test so a prior test overriding the mock
// can't leak into subsequent searches.
const mockedCoingecko = vi.mocked(Coingecko);
const mockedCoingeckoSearch = vi.fn<() => Promise<{ coins: unknown[] }>>();

const installEmptyCoingeckoMock = () => {
  mockedCoingeckoSearch.mockReset();
  mockedCoingeckoSearch.mockResolvedValue({ coins: [] });
  mockedCoingecko.mockImplementation(
    () =>
      ({
        search: { get: mockedCoingeckoSearch },
        simple: { price: { get: vi.fn<any>().mockResolvedValue({}) } },
        coins: {
          marketChart: {
            get: vi.fn<any>().mockResolvedValue({ prices: [] }),
            getRange: vi.fn<any>().mockResolvedValue({ prices: [] }),
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
  );
};

describe('GET /investments/securities/search', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-bind FMP and CoinGecko mocks so previous-test overrides don't leak.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFmpClient.mockImplementation(() => ({ search: mockedFmpSearch }) as any);
    installEmptyCoingeckoMock();
    dataProviderFactory.clearCache();
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
    // Stock providers don't surface logo URLs — the frontend derives them
    // from the ticker via logo.dev, so logoUrl is absent here.
    expect(results[0]?.logoUrl).toBeFalsy();

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

    // FMP client should be called for short queries
    expect(mockedFmpSearch).toHaveBeenCalled();
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

  it('should not include isInPortfolio flag when portfolioId is not provided', async () => {
    // Mock FMP client response
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
    ]);

    const results = await helpers.searchSecurities({ payload: { query: 'apple' }, raw: true });

    expect(results).toHaveLength(1);
    expect(results[0]!).toMatchObject({
      symbol: 'AAPL',
      name: 'Apple Inc.',
    });
    // isInPortfolio should be undefined when portfolioId is not provided
    expect(results[0]!.isInPortfolio).toBeUndefined();
  });

  it('should mark securities as not in portfolio when portfolio is empty', async () => {
    // Create a portfolio
    const portfolio = await helpers.createPortfolio({ raw: true });

    // Mock FMP client response
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
    ]);

    const results = await helpers.searchSecurities({
      payload: { query: 'apple', portfolioId: portfolio.id },
      raw: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.isInPortfolio).toBe(false);
  });

  it('drops crypto results from stock providers (CoinGecko owns crypto)', async () => {
    // FmpDataProvider.mapToAssetClass marks anything BTC/ETH/CRYPTO as crypto.
    // Since CoinGecko is the single source of truth for crypto, those entries
    // get filtered out at the composite layer so the UI never sees both
    // "BTC-USD" (Yahoo/FMP) and "BTC" (CoinGecko) for the same coin.
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
      {
        symbol: 'BTCUSD',
        name: 'Bitcoin USD',
        currency: 'USD',
        stockExchange: 'CCC',
        exchangeShortName: 'CCC',
      },
    ]);

    const results = await helpers.searchSecurities({ payload: { query: 'btc' }, raw: true });

    expect(results.find((r) => r.symbol === 'AAPL' && r.assetClass === ASSET_CLASS.stocks)).toBeDefined();
    // Stock-provider crypto is dropped.
    expect(results.find((r) => r.symbol === 'BTCUSD')).toBeUndefined();
    // The only crypto rows that survive come from CoinGecko (none in this mock).
    expect(
      results.every((r) => r.assetClass !== ASSET_CLASS.crypto || r.providerName === SECURITY_PROVIDER.coingecko),
    ).toBe(true);
  });

  it('honors the assetClass=stocks filter (skips CoinGecko entirely)', async () => {
    mockedFmpSearch.mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        stockExchange: 'NASDAQ Global Select',
        exchangeShortName: 'NASDAQ',
      },
    ]);
    mockedCoingeckoSearch.mockResolvedValue({
      coins: [{ id: 'apple-coin-scam', symbol: 'aapl', name: 'Apple Scam Coin', market_cap_rank: 9999 }],
    });

    const results = await helpers.searchSecurities({
      payload: { query: 'AAPL', assetClass: ASSET_CLASS.stocks },
      raw: true,
    });

    expect(results.find((r) => r.symbol === 'AAPL' && r.assetClass === ASSET_CLASS.stocks)).toBeDefined();
    expect(results.every((r) => r.assetClass === ASSET_CLASS.stocks)).toBe(true);
    // CoinGecko was never called because the composite skipped it.
    expect(mockedCoingeckoSearch).not.toHaveBeenCalled();
  });

  it('honors the assetClass=crypto filter (skips stock providers entirely)', async () => {
    mockedCoingeckoSearch.mockResolvedValue({
      coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 1 }],
    });

    const results = await helpers.searchSecurities({
      payload: { query: 'BTC', assetClass: ASSET_CLASS.crypto },
      raw: true,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.assetClass === ASSET_CLASS.crypto)).toBe(true);
    // Stock providers were not consulted.
    expect(mockedFmpSearch).not.toHaveBeenCalled();
  });

  it('includes CoinGecko crypto results alongside stock results, ranked exact-then-partial by market cap', async () => {
    // FMP returns nothing for "ETH" (no matching tickers)
    mockedFmpSearch.mockResolvedValue([]);

    // CoinGecko returns Ethereum (exact match) plus several partial-match coins
    // including a scam coin sharing the "ETH" ticker that should still surface
    // (we don't filter — we just cap by market cap).
    mockedCoingeckoSearch.mockResolvedValue({
      coins: [
        // Two coins with the exact ticker "ETH"; the lower market_cap_rank wins.
        {
          id: 'ethereum',
          symbol: 'eth',
          name: 'Ethereum',
          market_cap_rank: 2,
          thumb: 'https://coin-images.coingecko.com/coins/images/279/thumb/ethereum.png',
          small: 'https://coin-images.coingecko.com/coins/images/279/small/ethereum.png',
          large: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
        },
        {
          id: 'scam-eth',
          symbol: 'eth',
          name: 'Scam ETH',
          market_cap_rank: 9999,
          // CDN-unexpected shape: verifies toSmallCoinGeckoImage returns the
          // original URL unchanged when the regex doesn't match.
          large: 'https://example.com/scam-eth.png',
        },
        // Partial-match coins (symbol != "ETH"), sorted by rank.
        {
          id: 'ethereum-classic',
          symbol: 'etc',
          name: 'Ethereum Classic',
          market_cap_rank: 30,
          // Only thumb — verifies the `large -> thumb` fallback chain in mapCoin.
          thumb: 'https://coin-images.coingecko.com/coins/images/453/thumb/ethereum-classic.png',
        },
        { id: 'ethereum-name-service', symbol: 'ens', name: 'Ethereum Name Service', market_cap_rank: 95 },
      ],
    });

    const results = await helpers.searchSecurities({ payload: { query: 'ETH' }, raw: true });

    const cryptoResults = results.filter((r) => r.assetClass === ASSET_CLASS.crypto);
    expect(cryptoResults.length).toBeGreaterThanOrEqual(3);

    // Exact symbol match comes first, ranked by market cap
    const ethereum = cryptoResults.find((r) => r.providerSymbol === 'ethereum');
    expect(ethereum).toBeDefined();
    expect(ethereum?.symbol).toBe('ETH');
    expect(ethereum?.matchType).toBe('exact');
    expect(ethereum?.marketCapRank).toBe(2);
    // The mapper rewrites the CoinGecko image path to /small/ regardless of
    // which size the SDK exposed — saves ~10x bandwidth at our display size.
    expect(ethereum?.logoUrl).toBe('https://coin-images.coingecko.com/coins/images/279/small/ethereum.png');

    // Partial-match coin appears with matchType = 'partial'
    const etc = cryptoResults.find((r) => r.providerSymbol === 'ethereum-classic');
    expect(etc?.matchType).toBe('partial');
    expect(etc?.symbol).toBe('ETC');
    // ETC's mock omits `large` (only `thumb` set), but the rewrite still lands on /small/.
    expect(etc?.logoUrl).toBe('https://coin-images.coingecko.com/coins/images/453/small/ethereum-classic.png');

    // Coin lacking image fields surfaces a null logoUrl rather than undefined.
    const ens = cryptoResults.find((r) => r.providerSymbol === 'ethereum-name-service');
    expect(ens?.logoUrl ?? null).toBeNull();

    // Non-CoinGecko-CDN URL bypasses the rewrite and passes through unchanged.
    const scamEth = cryptoResults.find((r) => r.providerSymbol === 'scam-eth');
    expect(scamEth?.logoUrl).toBe('https://example.com/scam-eth.png');
  });

  it('should mark securities as in portfolio when they exist in holdings', async () => {
    // Create a portfolio
    const portfolio = await helpers.createPortfolio({ raw: true });

    // Create a security and add it to the portfolio
    const [security] = await helpers.seedSecurities([{ symbol: 'AAPL', name: 'Apple Inc.', currencyCode: 'USD' }]);

    if (!security) {
      throw new Error('Failed to seed security');
    }

    // Create a holding for this security
    await helpers.createHolding({
      payload: {
        portfolioId: portfolio.id,
        securityId: security.id,
      },
      raw: true,
    });

    // Re-establish mock binding after seedSecurities (which resets the mock and clears cache)
    dataProviderFactory.clearCache();
    mockedFmpClient.mockImplementation(function (this: Record<string, unknown>) {
      this.search = mockedFmpSearch;
    } as unknown as typeof FmpClient);

    // Mock FMP client response with AAPL and GOOG
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

    const results = await helpers.searchSecurities({
      payload: { query: 'a', portfolioId: portfolio.id },
      raw: true,
    });

    expect(results).toHaveLength(2);

    // AAPL should be marked as in portfolio
    const appleResult = results.find((r) => r.symbol === 'AAPL');
    expect(appleResult?.isInPortfolio).toBe(true);

    // GOOG should not be marked as in portfolio
    const googleResult = results.find((r) => r.symbol === 'GOOG');
    expect(googleResult?.isInPortfolio).toBe(false);
  });
});
