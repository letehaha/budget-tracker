import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import { logger } from '@js/utils';
import Holdings from '@models/investments/holdings.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import { restClient } from '@polygon.io/client-js';
import { dataProviderFactory } from '@services/investments/data-providers/provider-factory';
import * as helpers from '@tests/helpers';
import { makeRequest } from '@tests/helpers/common';
import alpha from 'alphavantage';
import YahooFinance from 'yahoo-finance2';

const mockedRestClient = jest.mocked(restClient);
const mockApi = mockedRestClient.getMockImplementation()!('test');
const mockedAggregates = jest.mocked(mockApi.stocks.aggregates);

const mockedYahooFinance = jest.mocked(YahooFinance);
const mockedAlpha = jest.mocked(alpha);
const mockAlphaVantage = mockedAlpha.getMockImplementation()!({ key: 'test' });
const mockedAlphaDaily = jest.mocked(mockAlphaVantage.data.daily);

describe('POST /holdings (create holding)', () => {
  let investmentPortfolio: Portfolios;
  let vooSecurity: Securities;

  beforeEach(async () => {
    jest.clearAllMocks();

    investmentPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({
        name: 'Test Investment Portfolio',
      }),
      raw: true,
    });

    const seededSecurities = await helpers.seedSecurities([{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }]);
    const firstSecurity = seededSecurities[0];
    if (!firstSecurity) throw new Error('VOO security not found after seeding');
    vooSecurity = firstSecurity;
  });

  it('should create a holding successfully', async () => {
    const response = await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    expect(response.statusCode).toBe(201);

    const holding = await Holdings.findOne({
      where: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    expect(holding).toBeTruthy();
    expect(holding?.quantity).toBeNumericEqual(0);
    expect(holding?.costBasis).toBeNumericEqual(0);
    expect(holding?.currencyCode).toBe(vooSecurity.currencyCode);
  });

  it('should fail to create a holding for non-existent portfolio', async () => {
    const response = await helpers.createHolding({
      payload: {
        portfolioId: generateRandomRecordId(),
        securityId: vooSecurity.id,
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should fail to create a holding for non-existent security', async () => {
    const response = await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: generateRandomRecordId(),
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should fail to create a duplicate holding', async () => {
    // Create first holding
    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    // Try to create duplicate
    const response = await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
  });

  it('fails if required fields are missing', async () => {
    // Missing portfolioId
    const payloadMissingPortfolioId = { securityId: vooSecurity.id } as unknown as Parameters<
      typeof helpers.createHolding
    >[0]['payload'];

    let response = await helpers.createHolding({
      payload: payloadMissingPortfolioId,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    // Missing securityId
    const payloadMissingSecurityId = { portfolioId: investmentPortfolio.id } as unknown as Parameters<
      typeof helpers.createHolding
    >[0]['payload'];

    response = await helpers.createHolding({
      payload: payloadMissingSecurityId,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('background sync is not called on duplicate', async () => {
    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });

    await helpers.sleep(200); // sync is triggered in background, so we need to wait for it to clear

    mockedAggregates.mockClear();

    const response = await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
      raw: false,
    });
    expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    expect(mockedAggregates).not.toHaveBeenCalled();
  });

  it('correctly sets all default values', async () => {
    mockedAggregates.mockResolvedValue({
      results: [{ c: 123, t: new Date().getTime() }],
    });
    const holding = await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
      raw: true,
    });
    expect(holding.quantity).toBeNumericEqual(0);
    expect(holding.costBasis).toBeNumericEqual(0);
    expect(holding.refCostBasis).toBeNumericEqual(0);
    expect(typeof holding.currencyCode).toBe('string');
    expect(holding.portfolioId).toBe(investmentPortfolio.id);
    expect(holding.securityId).toBe(vooSecurity.id);
  });

  it('rejects searchResult with unsupported asset class (e.g. crypto)', async () => {
    const response = await makeRequest({
      method: 'post',
      url: '/investments/holding',
      payload: {
        portfolioId: investmentPortfolio.id,
        searchResult: {
          symbol: 'BTC-USD',
          name: 'Bitcoin USD',
          assetClass: ASSET_CLASS.crypto,
          providerName: SECURITY_PROVIDER.yahoo,
          currencyCode: 'USD',
          exchangeName: 'CCC',
          exchangeAcronym: 'CCC',
        },
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    const created = await Securities.findOne({ where: { symbol: 'BTC-USD' } });
    expect(created).toBeNull();
  });

  it.todo('prevents race condition on duplicate (only one succeeds)');

  describe('searchResult with priceSourceSymbol (Yahoo ISIN fallback path)', () => {
    it('persists priceSourceSymbol on the new security and routes initial price fetch through it', async () => {
      // End-to-end coverage that the Zod schema accepts priceSourceSymbol, the
      // controller forwards it to addSecurityFromSearch, securities-manage
      // writes the column, and the latest-price fetch reads from the local
      // ticker instead of the sparse ISIN-suffix listing.
      const mockedYahooQuote = jest.fn<any>().mockResolvedValue({
        symbol: 'MEUD.PA',
        regularMarketPreviousClose: 92.5,
        regularMarketTime: Math.floor(Date.now() / 1000),
      });
      const mockedYahooChart = jest.fn<any>().mockResolvedValue({
        quotes: [{ date: new Date('2024-01-15'), close: 92.5, adjclose: 92.5 }],
      });
      mockedYahooFinance.mockImplementation(
        () =>
          ({
            search: jest.fn<any>().mockRejectedValue(new Error('not configured')),
            quote: mockedYahooQuote,
            chart: mockedYahooChart,
          }) as any,
      );

      const response = await makeRequest({
        method: 'post',
        url: '/investments/holding',
        payload: {
          portfolioId: investmentPortfolio.id,
          searchResult: {
            symbol: 'IE00B53L3W79.IR',
            providerSymbol: 'IE00B53L3W79.IR',
            priceSourceSymbol: 'MEUD.PA',
            name: 'iShares Core EURO STOXX 50',
            assetClass: ASSET_CLASS.stocks,
            providerName: SECURITY_PROVIDER.yahoo,
            currencyCode: 'EUR',
            isin: 'IE00B53L3W79',
          },
        },
      });

      expect(response.statusCode).toBe(201);

      const stored = await Securities.findOne({ where: { providerSymbol: 'IE00B53L3W79.IR' } });
      expect(stored).toBeTruthy();
      expect(stored?.symbol).toBe('IE00B53L3W79.IR');
      expect(stored?.providerSymbol).toBe('IE00B53L3W79.IR');
      expect(stored?.priceSourceSymbol).toBe('MEUD.PA');
      expect(stored?.priceQuerySymbol).toBe('MEUD.PA');
      expect(stored?.currencyCode).toBe('EUR');

      // Latest-price fetch went through the local ticker, not the ISIN-suffix.
      expect(mockedYahooQuote).toHaveBeenCalledWith('MEUD.PA');
      const quoteSymbols = mockedYahooQuote.mock.calls.map((c) => c[0]);
      expect(quoteSymbols).not.toContain('IE00B53L3W79.IR');
    });

    it('ignores explicit null priceSourceSymbol via client (Zod strips it)', async () => {
      // Zod schema is .optional() (not .nullable()) – sending null is treated
      // as a validation rejection at the boundary, preventing a client from
      // silently wiping a previously-stored priceSourceSymbol on re-add.
      const response = await makeRequest({
        method: 'post',
        url: '/investments/holding',
        payload: {
          portfolioId: investmentPortfolio.id,
          searchResult: {
            symbol: 'AAPL',
            providerSymbol: 'AAPL',
            priceSourceSymbol: null,
            name: 'Apple Inc.',
            assetClass: ASSET_CLASS.stocks,
            providerName: SECURITY_PROVIDER.yahoo,
            currencyCode: 'USD',
          },
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('does not overwrite priceSourceSymbol when re-add omits the field', async () => {
      // Re-adding the same security via search (e.g. user re-adds after delete)
      // must NOT clear a stored priceSourceSymbol just because the new search
      // result didn't carry one. The securities-manage update path guards on
      // `!= null` so undefined leaves the column intact.
      const seeded = await Securities.create({
        symbol: 'IE00B53L3W79.IR',
        providerSymbol: 'IE00B53L3W79.IR',
        priceSourceSymbol: 'MEUD.PA',
        name: 'iShares Core EURO STOXX 50',
        currencyCode: 'EUR',
        providerName: SECURITY_PROVIDER.yahoo,
        assetClass: ASSET_CLASS.stocks,
      });

      mockedAlphaDaily.mockResolvedValue({
        'Time Series (Daily)': { '2024-01-15': { '4. close': '92.5' } },
      });

      const response = await makeRequest({
        method: 'post',
        url: '/investments/holding',
        payload: {
          portfolioId: investmentPortfolio.id,
          searchResult: {
            symbol: 'IE00B53L3W79.IR',
            providerSymbol: 'IE00B53L3W79.IR',
            // priceSourceSymbol intentionally omitted
            name: 'iShares Core EURO STOXX 50',
            assetClass: ASSET_CLASS.stocks,
            providerName: SECURITY_PROVIDER.yahoo,
            currencyCode: 'EUR',
            isin: 'IE00B53L3W79',
          },
        },
      });
      expect(response.statusCode).toBe(201);

      const reloaded = await Securities.findByPk(seeded.id);
      expect(reloaded?.priceSourceSymbol).toBe('MEUD.PA');
    });
  });

  describe('cross-provider duplicate detection (symbol+currencyCode dedup)', () => {
    it('rejects adding an existing holding when the new searchResult comes from a different provider', async () => {
      // Repro for the bug surfaced after the Yahoo bump: vooSecurity (and other
      // existing holdings) were sourced when Yahoo was throwing FailedYahooValidationError
      // and the composite fell through to FMP – so `providerName='fmp', providerSymbol='VOO'`.
      // After the bump Yahoo works, so a user searching VOO and clicking the result
      // gets a fresh searchResult with `providerName='yahoo', providerSymbol='VOO'`.
      // The duplicate-detection key must treat these as the same logical security,
      // otherwise addSecurityFromSearch creates a SECOND Securities row and createHolding's
      // (portfolioId, securityId) check sees a different securityId and lets the duplicate through.
      const initialResponse = await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: vooSecurity.id,
        },
      });
      expect(initialResponse.statusCode).toBe(201);
      await helpers.sleep(100);

      const response = await makeRequest({
        method: 'post',
        url: '/investments/holding',
        payload: {
          portfolioId: investmentPortfolio.id,
          searchResult: {
            symbol: 'VOO',
            providerSymbol: 'VOO',
            name: 'Vanguard S&P 500 ETF',
            assetClass: ASSET_CLASS.stocks,
            providerName: SECURITY_PROVIDER.yahoo,
            currencyCode: 'USD',
          },
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);

      const vooSecurities = await Securities.findAll({ where: { symbol: 'VOO' } });
      expect(vooSecurities).toHaveLength(1);

      const holdings = await Holdings.findAll({
        where: { portfolioId: investmentPortfolio.id, securityId: vooSecurity.id },
      });
      expect(holdings).toHaveLength(1);
    });
  });

  describe('background historical price sync error surfacing (MONEY-MATTER-BACKEND-6M)', () => {
    it('surfaces the real provider cause instead of "Unknown error" when every price provider fails', async () => {
      const symbol = 'IE00BLCHJB90.SG';

      // This symbol shape matches no US/European suffix, so it routes to Yahoo
      // (primary) with Alpha Vantage as the only fallback.
      const security = await Securities.create({
        symbol,
        providerSymbol: symbol,
        name: 'Test Global ETF',
        currencyCode: 'EUR',
        providerName: SECURITY_PROVIDER.yahoo,
        assetClass: ASSET_CLASS.stocks,
      });

      mockedYahooFinance.mockImplementation(
        () =>
          ({
            search: jest.fn<any>().mockRejectedValue(new Error('not configured')),
            quote: jest.fn<any>().mockRejectedValue(new Error('not configured')),
            chart: jest.fn<any>().mockRejectedValue(new Error('Yahoo: no data for symbol')),
          }) as any,
      );

      // The real `alphavantage` package rejects with a bare string (not an
      // Error) on API errors — the exact shape that used to become "Unknown
      // error".
      mockedAlphaDaily.mockRejectedValue(
        'An AlphaVantage error occurred. Invalid API call. Please retry or visit the documentation (https://www.alphavantage.co/documentation/) for TIME_SERIES_DAILY.',
      );

      // dataProviderFactory caches the composite/Yahoo client on first
      // getProvider(); an earlier test may have baked in a stale Yahoo mock, so
      // clear it to force a fresh client for this test's background sync.
      dataProviderFactory.clearCache();

      const errorSpy = jest.spyOn(logger, 'error');

      const response = await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: security.id,
        },
      });

      // Price sync runs fire-and-forget after the transaction commits, so a
      // single bad ticker never fails holding creation itself.
      expect(response.statusCode).toBe(201);

      await helpers.sleep(300); // let the background sync's rejection land

      const calls = errorSpy.mock.calls as unknown as Array<[{ message?: string; error?: Error }]>;
      const syncFailureCall = calls.find(([arg]) => arg?.message?.includes(`securityId: ${security.id}`));
      expect(syncFailureCall).toBeTruthy();

      const surfacedMessage = syncFailureCall?.[0].error?.message ?? '';
      expect(surfacedMessage).toContain(symbol);
      expect(surfacedMessage).toContain('alphavantage');
      expect(surfacedMessage).toContain('Invalid API call');
      expect(surfacedMessage).not.toContain('Unknown error');

      errorSpy.mockRestore();
    });
  });
});
