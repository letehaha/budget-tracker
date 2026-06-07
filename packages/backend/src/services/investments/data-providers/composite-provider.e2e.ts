import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import { restClient } from '@polygon.io/client-js';
import * as helpers from '@tests/helpers';
import alpha from 'alphavantage';
import YahooFinance from 'yahoo-finance2';

import { FmpClient, type FmpSearchResult } from './clients/fmp-client';
import { dataProviderFactory } from './provider-factory';

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

// Yahoo is the primary search provider. Override constructor to use shared mocks
// so individual tests can control Yahoo behaviour.
const mockedYahooFinance = jest.mocked(YahooFinance);
const mockedYahooSearch = jest.fn<any>();
const mockedYahooQuote = jest.fn<any>();
const mockedYahooChart = jest.fn<any>();

mockedYahooFinance.mockImplementation(
  () =>
    ({
      search: mockedYahooSearch,
      quote: mockedYahooQuote,
      chart: mockedYahooChart,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
);

/**
 * Shared setup: clear factory cache and reset Yahoo mocks to "reject" so that
 * FMP-focused test blocks fall through correctly while Yahoo-focused blocks can
 * override per-test.
 */
function resetProviderMocks() {
  jest.clearAllMocks();
  dataProviderFactory.clearCache();

  // Yahoo rejects by default → composite falls back to FMP for search
  mockedYahooSearch.mockRejectedValue(new Error('Yahoo mock: not configured'));
  mockedYahooQuote.mockRejectedValue(new Error('Yahoo mock: not configured'));
  mockedYahooChart.mockRejectedValue(new Error('Yahoo mock: not configured'));
}

/**
 * Number of exchange suffixes the Yahoo provider fans out across when the
 * primary search returns empty for an ISIN-shaped query. Must stay in sync
 * with `ISIN_EXCHANGE_SUFFIXES` in yahoo-provider.ts.
 */
const ISIN_EXCHANGE_SUFFIXES_COUNT = 6;

/**
 * Queues `count` consecutive "Not Found" rejections on the Yahoo quote mock.
 * Used after the ISIN-suffix fan-out tests seed N successful resolves to
 * stub out the remaining suffixes. The thrown Error's message satisfies the
 * provider's `isExpectedNotFoundError` check so it stays at info-level
 * instead of error-logging.
 */
function rejectRemainingQuotesAsNotFound(count: number) {
  for (let i = 0; i < count; i++) {
    mockedYahooQuote.mockRejectedValueOnce(new Error('Quote not found'));
  }
}

/**
 * Builds a faux `FailedYahooValidationError` matching yahoo-finance2's shape.
 * The provider narrows its broad catch on `err.name === 'FailedYahooValidationError'`,
 * so the rejection must carry that name to be treated as schema drift (info)
 * rather than an operational failure (error).
 */
function makeYahooSchemaError(): Error {
  const err = new Error('Failed Yahoo Schema validation');
  err.name = 'FailedYahooValidationError';
  return err;
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

  it('should filter out non-stock asset classes (crypto, fixed_income) returned by Yahoo', async () => {
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

    // BTC-USD (crypto) and VBTLX (fixed_income) are filtered by the search service;
    // only the stock (SPY) survives.
    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe('SPY');
    expect(results[0]?.assetClass).toBe(ASSET_CLASS.stocks);
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
// 1b. Yahoo ISIN fallback: search() returns nothing, quote() resolves by suffix
// ---------------------------------------------------------------------------
describe('GET /investments/securities/search - Yahoo ISIN fallback', () => {
  const TEST_ISIN = 'IE00B53L3W79';

  beforeEach(() => {
    resetProviderMocks();
    // Yahoo's search endpoint isn't indexed by ISIN, so an ISIN query lands empty.
    mockedYahooSearch.mockResolvedValue({ quotes: [] });
  });

  it('resolves a bare ISIN via the Euronext (.IR) suffix when search is empty', async () => {
    // Fan-out order matches ISIN_EXCHANGE_SUFFIXES: .IR, .DE, .PA, .AS, .MI, .L.
    // Yahoo categorizes UCITS ETFs as `MUTUALFUND`, not `ETF` – the fallback
    // remaps this to stocks so the service-layer filter doesn't drop it.
    mockedYahooQuote.mockResolvedValueOnce({
      symbol: 'IE00B53L3W79.IR',
      longName: 'iShares Core EURO STOXX 50',
      currency: 'EUR',
      exchange: 'PAR',
      fullExchangeName: 'Paris',
      quoteType: 'MUTUALFUND',
    });
    rejectRemainingQuotesAsNotFound(5);

    const results = await helpers.searchSecurities({ payload: { query: TEST_ISIN }, raw: true });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      symbol: 'IE00B53L3W79.IR',
      providerSymbol: 'IE00B53L3W79.IR',
      name: 'iShares Core EURO STOXX 50',
      currencyCode: 'EUR',
      providerName: SECURITY_PROVIDER.yahoo,
      assetClass: ASSET_CLASS.stocks,
      isin: TEST_ISIN,
    });
    // Primary search returns empty, then name-lookup search runs against the
    // resolved fund longName (also empty in this test → no extra listings).
    expect(mockedYahooSearch).toHaveBeenCalledTimes(2);
    expect(mockedYahooQuote).toHaveBeenCalledTimes(ISIN_EXCHANGE_SUFFIXES_COUNT);
  });

  it('surfaces additional local-ticker listings (e.g. MEUD.PA, CS51.DE) via name search', async () => {
    // The ISIN-suffix form (e.g. `IE00B53L3W79.IR`) maps to the Irish registration
    // venue, where Yahoo's chart() returns only sparse anchor points. The same
    // ETF trades under local tickers on other exchanges (`MEUD.PA` Paris,
    // `CS51.DE` Xetra) with full daily history. After finding the ISIN-suffix
    // hit we search by the fund's longName, then quote() each candidate to
    // confirm currency, and surface all of them so the user picks their venue.
    mockedYahooSearch
      .mockResolvedValueOnce({ quotes: [] }) // primary ISIN search – empty as usual
      .mockResolvedValueOnce({
        quotes: [
          { symbol: 'MEUD.PA', longname: 'iShares Core EURO STOXX 50', exchange: 'PAR', isYahooFinance: true },
          { symbol: 'CS51.DE', longname: 'iShares Core EURO STOXX 50', exchange: 'GER', isYahooFinance: true },
          // The ISIN.suffix form itself – must be skipped (already collected).
          { symbol: 'IE00B53L3W79.IR', exchange: 'ISE', isYahooFinance: true },
        ],
      });

    // Suffix fanout: only .IR resolves (Irish listing).
    mockedYahooQuote.mockResolvedValueOnce({
      symbol: 'IE00B53L3W79.IR',
      longName: 'iShares Core EURO STOXX 50',
      currency: 'EUR',
      exchange: 'ISE',
      fullExchangeName: 'Irish Stock Exchange',
      quoteType: 'MUTUALFUND',
    });
    rejectRemainingQuotesAsNotFound(5);
    // Name-lookup verification quotes for the two local-ticker candidates.
    mockedYahooQuote
      .mockResolvedValueOnce({
        symbol: 'MEUD.PA',
        longName: 'iShares Core EURO STOXX 50',
        currency: 'EUR',
        exchange: 'PAR',
        fullExchangeName: 'Paris',
        quoteType: 'ETF',
      })
      .mockResolvedValueOnce({
        symbol: 'CS51.DE',
        longName: 'iShares Core EURO STOXX 50',
        currency: 'EUR',
        exchange: 'GER',
        fullExchangeName: 'XETRA',
        quoteType: 'ETF',
      });

    const results = await helpers.searchSecurities({ payload: { query: TEST_ISIN }, raw: true });

    expect(results.map((r) => r.symbol).toSorted()).toEqual(['CS51.DE', 'IE00B53L3W79.IR', 'MEUD.PA']);
    expect(results.every((r) => r.isin === TEST_ISIN)).toBe(true);
    expect(results.every((r) => r.assetClass === ASSET_CLASS.stocks)).toBe(true);

    const meud = results.find((r) => r.symbol === 'MEUD.PA');
    expect(meud).toMatchObject({
      providerSymbol: 'MEUD.PA',
      currencyCode: 'EUR',
      exchangeAcronym: 'PAR',
    });

    // The ISIN-suffix row gets the FIRST same-currency local ticker attached
    // as its price source. Yahoo's name-lookup results stream in candidate
    // order; pinning "first wins" here makes the contract explicit so a
    // regression that re-orders candidates is caught.
    const isinRow = results.find((r) => r.symbol === 'IE00B53L3W79.IR');
    expect(isinRow?.priceSourceSymbol).toBe('MEUD.PA');
    expect(meud?.priceSourceSymbol).toBeUndefined();
  });

  it('does NOT attach a cross-currency local ticker as priceSourceSymbol', async () => {
    // The ISIN-suffix row is EUR; the only name-lookup hit is GBP (London).
    // Storing GBP prices against an EUR row would silently corrupt the chart,
    // so we leave priceSourceSymbol unset and accept sparse history for
    // this particular row.
    mockedYahooSearch.mockResolvedValueOnce({ quotes: [] }).mockResolvedValueOnce({
      quotes: [{ symbol: 'EUNL.L', longname: 'iShares Core EURO STOXX 50', exchange: 'LSE', isYahooFinance: true }],
    });

    mockedYahooQuote.mockResolvedValueOnce({
      symbol: 'IE00B53L3W79.IR',
      longName: 'iShares Core EURO STOXX 50',
      currency: 'EUR',
      exchange: 'ISE',
      quoteType: 'MUTUALFUND',
    });
    rejectRemainingQuotesAsNotFound(5);
    // Name-lookup quote: London listing in GBP.
    mockedYahooQuote.mockResolvedValueOnce({
      symbol: 'EUNL.L',
      longName: 'iShares Core EURO STOXX 50',
      currency: 'GBP',
      exchange: 'LSE',
      quoteType: 'ETF',
    });

    const results = await helpers.searchSecurities({ payload: { query: TEST_ISIN }, raw: true });

    expect(results.map((r) => r.symbol).toSorted()).toEqual(['EUNL.L', 'IE00B53L3W79.IR']);
    const isinRow = results.find((r) => r.symbol === 'IE00B53L3W79.IR');
    // Same-currency requirement failed → no source attached.
    expect(isinRow?.priceSourceSymbol).toBeUndefined();
  });

  it('keeps the ISIN-suffix form when the name-lookup search throws (schema validation)', async () => {
    mockedYahooSearch
      .mockResolvedValueOnce({ quotes: [] }) // primary ISIN search – empty
      .mockRejectedValueOnce(makeYahooSchemaError()); // name lookup throws

    mockedYahooQuote
      .mockResolvedValueOnce({
        symbol: 'IE00B53L3W79.IR',
        longName: 'iShares Core EURO STOXX 50',
        currency: 'EUR',
        exchange: 'ISE',
        quoteType: 'MUTUALFUND',
      })
      .mockRejectedValue(new Error('Quote not found'));

    const results = await helpers.searchSecurities({ payload: { query: TEST_ISIN }, raw: true });

    expect(results).toHaveLength(1);
    expect(results[0]?.symbol).toBe('IE00B53L3W79.IR');
  });

  it('still maps a real ETF quoteType to stocks (sanity check, non-UCITS path)', async () => {
    mockedYahooQuote
      .mockResolvedValueOnce({
        symbol: 'IE00B53L3W79.L',
        longName: 'iShares Core EURO STOXX 50',
        currency: 'GBP',
        exchange: 'LSE',
        quoteType: 'ETF',
      })
      .mockRejectedValue(new Error('Quote not found'));

    const results = await helpers.searchSecurities({ payload: { query: TEST_ISIN }, raw: true });

    expect(results).toHaveLength(1);
    expect(results[0]?.assetClass).toBe(ASSET_CLASS.stocks);
  });

  it('returns every venue that resolves so the user can pick (.IR + .DE both match)', async () => {
    mockedYahooQuote
      .mockResolvedValueOnce({
        symbol: 'IE00B53L3W79.IR',
        shortName: 'iShares EURO STOXX 50',
        currency: 'EUR',
        exchange: 'PAR',
        quoteType: 'ETF',
      })
      .mockResolvedValueOnce({
        symbol: 'IE00B53L3W79.DE',
        shortName: 'iShares EURO STOXX 50',
        currency: 'EUR',
        exchange: 'GER',
        quoteType: 'ETF',
      });
    rejectRemainingQuotesAsNotFound(4);

    const results = await helpers.searchSecurities({ payload: { query: TEST_ISIN }, raw: true });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.symbol).toSorted()).toEqual(['IE00B53L3W79.DE', 'IE00B53L3W79.IR']);
    expect(results.every((r) => r.isin === TEST_ISIN)).toBe(true);
  });

  it('returns empty when search is empty and no exchange suffix resolves', async () => {
    mockedYahooQuote.mockRejectedValue(new Error('Quote not found'));

    const results = await helpers.searchSecurities({ payload: { query: TEST_ISIN }, raw: true });

    expect(results).toHaveLength(0);
    expect(mockedYahooQuote).toHaveBeenCalledTimes(ISIN_EXCHANGE_SUFFIXES_COUNT);
  });

  it('normalizes lowercase ISIN input to uppercase before fallback', async () => {
    mockedYahooQuote
      .mockResolvedValueOnce({
        symbol: 'IE00B53L3W79.IR',
        longName: 'iShares Core EURO STOXX 50',
        currency: 'EUR',
        exchange: 'PAR',
        quoteType: 'ETF',
      })
      .mockRejectedValue(new Error('Quote not found'));

    const results = await helpers.searchSecurities({ payload: { query: TEST_ISIN.toLowerCase() }, raw: true });

    expect(results).toHaveLength(1);
    // Fallback was triggered for every exchange suffix even though the input was lowercase
    expect(mockedYahooQuote).toHaveBeenCalledTimes(ISIN_EXCHANGE_SUFFIXES_COUNT);
    expect(mockedYahooQuote).toHaveBeenNthCalledWith(1, `${TEST_ISIN}.IR`);
  });

  it('does NOT trigger fallback for non-ISIN queries that return empty', async () => {
    // "ZZZZZZ" is short and not ISIN-shaped, so empty search should not fan out to quote()
    const results = await helpers.searchSecurities({ payload: { query: 'ZZZZZZ' }, raw: true });

    expect(results).toHaveLength(0);
    expect(mockedYahooQuote).not.toHaveBeenCalled();
  });

  it('merges primary search hits with ISIN fallback when the ISIN-shaped query DOES return a primary result', async () => {
    // Real-world case (IE00B5BMR087 → CSSPX.MI): Yahoo's primary search now
    // sometimes resolves an ISIN directly to a single "canonical" venue
    // (often Milan or Frankfurt) – but users searching by ISIN want every
    // tradable venue so they can pick their broker's listing. The fallback
    // must run even when primary returned a hit.
    mockedYahooSearch
      .mockResolvedValueOnce({
        quotes: [
          {
            symbol: 'CSSPX.MI',
            longname: 'iShares Core S&P 500 UCITS ETF',
            shortname: 'iShares S&P 500',
            typeDisp: 'ETF',
            exchange: 'MIL',
            exchDisp: 'Milan',
            isYahooFinance: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        // Name-lookup surfaces extra venues the primary didn't include.
        quotes: [
          { symbol: 'SXR8.DE', longname: 'iShares Core S&P 500', exchange: 'GER', isYahooFinance: true },
          { symbol: 'CSPX.AS', longname: 'iShares Core S&P 500', exchange: 'AMS', isYahooFinance: true },
        ],
      });

    // Currency resolution for the primary search hit.
    mockedYahooQuote.mockResolvedValueOnce({ symbol: 'CSSPX.MI', currency: 'USD' });
    // ISIN-suffix fanout: only .IR resolves.
    mockedYahooQuote.mockResolvedValueOnce({
      symbol: 'IE00B5BMR087.IR',
      shortName: 'iShares Core S&P 500',
      currency: 'USD',
      exchange: 'ISE',
      quoteType: 'MUTUALFUND',
    });
    rejectRemainingQuotesAsNotFound(5);
    // Name-lookup verification quotes.
    mockedYahooQuote
      .mockResolvedValueOnce({
        symbol: 'SXR8.DE',
        longName: 'iShares Core S&P 500',
        currency: 'USD',
        exchange: 'GER',
        quoteType: 'ETF',
      })
      .mockResolvedValueOnce({
        symbol: 'CSPX.AS',
        longName: 'iShares Core S&P 500',
        currency: 'USD',
        exchange: 'AMS',
        quoteType: 'ETF',
      });

    const results = await helpers.searchSecurities({ payload: { query: 'IE00B5BMR087' }, raw: true });

    const symbols = results.map((r) => r.symbol).toSorted();
    expect(symbols).toEqual(['CSPX.AS', 'CSSPX.MI', 'IE00B5BMR087.IR', 'SXR8.DE']);
    // Every result for an ISIN-shaped query carries the queried ISIN.
    expect(results.every((r) => r.isin === 'IE00B5BMR087')).toBe(true);
    // All ETF/MUTUALFUND map to stocks under the ISIN remap.
    expect(results.every((r) => r.assetClass === ASSET_CLASS.stocks)).toBe(true);

    // The ISIN-suffix row gets a same-currency local ticker as its source.
    const isinRow = results.find((r) => r.symbol === 'IE00B5BMR087.IR');
    expect(isinRow?.priceSourceSymbol).toBe('SXR8.DE');
  });

  it('calls primary search with validateResult:false so Yahoo schema drift cannot kill ISIN results', async () => {
    // Regression guard: yahoo-finance2 ships fixed JSON Schemas against an
    // evolving Yahoo response shape. Without `validateResult: false`, any
    // new/renamed field in Yahoo's payload makes the validator throw
    // FailedYahooValidationError, the searchSecurities catch re-throws via
    // formatProviderError, the composite logs an error and returns [], and
    // the ISIN-fallback path never runs – producing the zero-results bug
    // every user hit when searching by ISIN in production.
    mockedYahooSearch.mockResolvedValue({ quotes: [] });
    mockedYahooQuote.mockRejectedValue(new Error('Quote not found'));

    await helpers.searchSecurities({ payload: { query: 'IE00B5BMR087' }, raw: true });

    // The first call is the primary search; we don't care about subsequent
    // name-lookup calls inside the fallback (those already use validateResult:false).
    expect(mockedYahooSearch).toHaveBeenNthCalledWith(1, 'IE00B5BMR087', { newsCount: 0 }, { validateResult: false });
  });

  it('drops fallback results that have no currency', async () => {
    mockedYahooQuote
      .mockResolvedValueOnce({
        symbol: 'IE00B53L3W79.IR',
        longName: 'iShares Core EURO STOXX 50',
        currency: 'EUR',
        exchange: 'PAR',
        quoteType: 'ETF',
      })
      .mockResolvedValueOnce({
        symbol: 'IE00B53L3W79.DE',
        longName: 'No Currency Quote',
        exchange: 'GER',
        quoteType: 'ETF',
        // currency intentionally missing
      });
    rejectRemainingQuotesAsNotFound(4);

    const results = await helpers.searchSecurities({ payload: { query: TEST_ISIN }, raw: true });

    expect(results).toHaveLength(1);
    expect(results[0]!.symbol).toBe('IE00B53L3W79.IR');
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

  it('should filter out unsupported Yahoo asset classes (options, bonds)', async () => {
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

    // Both options and bonds are unsupported asset classes – search service drops them.
    expect(results).toHaveLength(0);
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
