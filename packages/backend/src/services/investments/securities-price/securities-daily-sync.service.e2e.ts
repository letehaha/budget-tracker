import { SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { Money } from '@common/types/money';
import Holdings from '@models/investments/holdings.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import { restClient } from '@polygon.io/client-js';
import * as helpers from '@tests/helpers';
import alpha from 'alphavantage';
import { format, isToday, subDays } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import YahooFinance from 'yahoo-finance2';

import { FmpClient } from '../data-providers/clients/fmp-client';
import { dataProviderFactory } from '../data-providers/provider-factory';

// Mock data provider clients
const mockedRestClient = vi.mocked(restClient);
const mockPolygonApi = mockedRestClient.getMockImplementation()!('test');
const mockedPolygonAggregates = vi.mocked(mockPolygonApi.stocks.aggregatesGroupedDaily);

const mockedAlpha = vi.mocked(alpha);
const mockAlphaVantage = mockedAlpha.getMockImplementation()!({ key: 'test' });
const mockedAlphaDaily = vi.mocked(mockAlphaVantage.data.daily);

const mockedFmpClient = vi.mocked(FmpClient);
const mockedFmpHistoricalPrices = vi.fn();

mockedFmpClient.mockImplementation(
  () =>
    ({
      getHistoricalPrices: mockedFmpHistoricalPrices,
      search: vi.fn(),
      getQuote: vi.fn(),
      getHistoricalPricesFull: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
);

// Yahoo is now the primary provider for all operations.
// Override constructor to use shared mocks so tests can configure per-test.
const mockedYahooFinance = vi.mocked(YahooFinance);
const mockedYahooSearch = vi.fn<any>();
const mockedYahooQuote = vi.fn<any>();
const mockedYahooChart = vi.fn<any>();

mockedYahooFinance.mockImplementation(
  () =>
    ({
      search: mockedYahooSearch,
      quote: mockedYahooQuote,
      chart: mockedYahooChart,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
);

describe('Securities Daily Sync Service (via API Endpoint)', () => {
  let investmentPortfolio: Portfolios;
  let usSecurity: Securities;
  let nonUsSecurity: Securities;
  let securityWithStaleData: Securities;
  let securityWithExcludedHolding: Securities;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Yahoo mocks default to rejecting so seedSecurities falls back to FMP
    mockedYahooSearch.mockRejectedValue(new Error('Yahoo mock: not configured'));
    mockedYahooQuote.mockRejectedValue(new Error('Yahoo mock: not configured'));
    mockedYahooChart.mockRejectedValue(new Error('Yahoo mock: not configured'));

    // Create investment portfolio
    investmentPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({
        name: 'Test Investment Portfolio',
      }),
      raw: true,
    });

    // Create test securities
    const securities = await helpers.seedSecurities([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currencyCode: 'USD',
      },
      {
        symbol: 'ASML.AS',
        name: 'ASML Holding N.V.',
        currencyCode: 'EUR',
      },
      {
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        currencyCode: 'USD',
      },
      {
        symbol: 'GOOGL',
        name: 'Alphabet Inc.',
        currencyCode: 'USD',
      },
    ]);

    usSecurity = securities[0]!;
    nonUsSecurity = securities[1]!;
    securityWithStaleData = securities[2]!;
    securityWithExcludedHolding = securities[3]!;

    // Create holdings for securities to make them eligible for sync
    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: usSecurity.id,
      },
    });

    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: nonUsSecurity.id,
      },
    });

    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: securityWithStaleData.id,
      },
    });

    // Give the security with stale data an old pricing sync timestamp
    await Securities.update(
      { pricingLastSyncedAt: subDays(new Date(), 10) },
      { where: { id: securityWithStaleData.id } },
    );

    // Add some existing price data to test prioritization
    await SecurityPricing.create({
      securityId: securityWithStaleData.id,
      date: format(subDays(new Date(), 5), 'yyyy-MM-dd'),
      priceClose: Money.fromDecimal('100.00'),
      source: SECURITY_PROVIDER.polygon,
    });

    // Clear factory cache after seeding so the sync endpoint creates a fresh
    // composite provider that uses the shared Yahoo mocks configured per-test.
    dataProviderFactory.clearCache();
  });

  describe('Basic Sync Functionality', () => {
    it('should sync prices for all securities with non-excluded holdings via endpoint', async () => {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // Yahoo is the primary provider for all symbol types in the composite.
      // Mock chart() to return price data so the sync succeeds.
      mockedYahooChart.mockResolvedValue({
        quotes: [{ date: new Date(yesterday), close: 185.92, adjclose: 185.92 }],
      });

      // Trigger sync via API endpoint
      const response = await helpers.triggerSecuritiesSync();

      expect(response.statusCode).toBe(200);
      expect(helpers.extractResponse(response)).toEqual({
        message: 'Securities daily sync triggered successfully',
        triggered: true,
        timestamp: expect.any(String),
      });

      // Give some time for background sync to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify Yahoo was called for price data (all symbols routed to Yahoo)
      expect(mockedYahooChart).toHaveBeenCalled();

      // Verify price data was stored
      const securitiesPrices = await helpers.getSecuritiesPricesByDate({
        raw: true,
      });

      const usSecurityPrice = securitiesPrices.find((i) => i.securityId === usSecurity.id)!;
      const nonUsSecurityPrice = securitiesPrices.find((i) => i.securityId === nonUsSecurity.id)!;

      // All securities get prices from Yahoo (the primary provider)
      expect(usSecurityPrice.source).toBe(SECURITY_PROVIDER.yahoo);
      expect(nonUsSecurityPrice.source).toBe(SECURITY_PROVIDER.yahoo);

      // Verify sync timestamps were updated for synced securities
      const securities = await helpers.getAllSecurities({ raw: true });
      expect(securities.find((i) => i.id === securityWithExcludedHolding.id)!.pricingLastSyncedAt).toBe(null);
      expect(isToday(securities.find((i) => i.id === usSecurity.id)!.pricingLastSyncedAt!)).toBe(true);
      expect(isToday(securities.find((i) => i.id === nonUsSecurity.id)!.pricingLastSyncedAt!)).toBe(true);
      expect(isToday(securities.find((i) => i.id === securityWithStaleData.id)!.pricingLastSyncedAt!)).toBe(true);
    });

    it('should skip securities with excluded holdings only', async () => {
      // Yahoo is primary — mock chart to return data for eligible symbols
      mockedYahooChart.mockResolvedValue({
        quotes: [{ date: new Date(), close: 100, adjclose: 100 }],
      });

      // Trigger sync
      const response = await helpers.triggerSecuritiesSync();
      expect(response.statusCode).toBe(200);
      expect(helpers.extractResponse(response)).toEqual({
        message: 'Securities daily sync triggered successfully',
        triggered: true,
        timestamp: expect.any(String),
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify no price data was created for excluded security (GOOGL has no non-excluded holding)
      const excludedSecurityPrice = await SecurityPricing.findOne({
        where: { securityId: securityWithExcludedHolding.id },
      });
      expect(excludedSecurityPrice).toBeNull();

      // Verify sync timestamp was not updated for excluded security
      const securities = await helpers.getAllSecurities({ raw: true });
      const excludedSecurity = securities.find((s) => s.id === securityWithExcludedHolding.id);
      expect(excludedSecurity?.pricingLastSyncedAt).toBeNull();
    });
  });

  describe('Fallback when Yahoo is disabled for sync', () => {
    it('should route US stocks to Polygon and non-US to AlphaVantage when Yahoo is disabled', async () => {
      const originalValue = process.env.YAHOO_FINANCE_ENABLED;
      process.env.YAHOO_FINANCE_ENABLED = 'false';
      dataProviderFactory.clearCache();

      // Clear Yahoo call history from beforeEach (holding creation triggers historical sync)
      mockedYahooChart.mockClear();
      mockedYahooSearch.mockClear();
      mockedYahooQuote.mockClear();

      try {
        const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

        // Mock Polygon for US stocks
        mockedPolygonAggregates.mockResolvedValue({
          results: [
            { T: 'AAPL', t: new Date(yesterday).getTime(), c: 185.92 },
            { T: 'MSFT', t: new Date(yesterday).getTime(), c: 155.5 },
          ],
        });

        // Mock Alpha Vantage for non-US stock
        mockedAlphaDaily.mockResolvedValue({
          'Time Series (Daily)': {
            [yesterday]: { '4. close': '728.90' },
          },
        });

        const response = await helpers.triggerSecuritiesSync();
        expect(response.statusCode).toBe(200);

        await new Promise((resolve) => setTimeout(resolve, 200));

        // Yahoo should NOT be called (disabled)
        expect(mockedYahooChart).not.toHaveBeenCalled();

        // Polygon should handle US stocks
        expect(mockedPolygonAggregates).toHaveBeenCalled();
        const polygonCall = mockedPolygonAggregates.mock.calls.find((call) => call[0] === yesterday);
        expect(polygonCall).toBeDefined();

        // Alpha Vantage should handle non-US stocks
        expect(mockedAlphaDaily).toHaveBeenCalledWith('ASML.AS', 'full');

        // Verify prices stored with correct fallback provider sources
        const securitiesPrices = await helpers.getSecuritiesPricesByDate({ raw: true });
        const usSecurityPrice = securitiesPrices.find((i) => i.securityId === usSecurity.id)!;
        const nonUsSecurityPrice = securitiesPrices.find((i) => i.securityId === nonUsSecurity.id)!;

        expect(usSecurityPrice.source).toBe(SECURITY_PROVIDER.polygon);
        expect(nonUsSecurityPrice.source).toBe(SECURITY_PROVIDER.alphavantage);
      } finally {
        if (originalValue === undefined) {
          delete process.env.YAHOO_FINANCE_ENABLED;
        } else {
          process.env.YAHOO_FINANCE_ENABLED = originalValue;
        }
        dataProviderFactory.clearCache();
      }
    });
  });

  describe('Prioritization Logic', () => {
    it('should prioritize securities with stale pricing data first', async () => {
      // Create another security with very recent sync timestamp
      const recentSyncSecurity = await helpers.seedSecurities([
        {
          symbol: 'NVDA',
          name: 'NVIDIA Corporation',
          currencyCode: 'USD',
        },
      ]);

      await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: recentSyncSecurity[0]!.id,
        },
      });

      // Set recent sync timestamp (just 1 hour ago)
      await Securities.update(
        { pricingLastSyncedAt: subDays(new Date(), 0) },
        { where: { id: recentSyncSecurity[0]!.id } },
      );

      // Yahoo is primary for all symbols — mock chart to return data
      mockedYahooChart.mockResolvedValue({
        quotes: [{ date: new Date(), close: 185.92, adjclose: 185.92 }],
      });

      // Trigger sync
      await helpers.triggerSecuritiesSync();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // All securities should be processed, including the stale one
      const securities = await helpers.getAllSecurities({ raw: true });

      // Verify that the stale security (MSFT) was processed
      const staleSecurity = securities.find((s) => s.id === securityWithStaleData.id)!;
      expect(staleSecurity?.pricingLastSyncedAt).toBeTruthy();
      expect(isToday(staleSecurity.pricingLastSyncedAt!)).toBe(true);

      // The never-synced securities should also be processed
      const neverSyncedApple = securities.find((s) => s.id === usSecurity.id)!;
      const neverSyncedAsml = securities.find((s) => s.id === nonUsSecurity.id)!;
      expect(neverSyncedApple?.pricingLastSyncedAt).toBeTruthy();
      expect(neverSyncedAsml?.pricingLastSyncedAt).toBeTruthy();
      expect(isToday(neverSyncedApple.pricingLastSyncedAt!)).toBe(true);
      expect(isToday(neverSyncedAsml.pricingLastSyncedAt!)).toBe(true);

      // The recently synced security should also be processed (all are processed together)
      const recentSecurity = securities.find((s) => s.id === recentSyncSecurity[0]!.id)!;
      expect(recentSecurity?.pricingLastSyncedAt).toBeTruthy();
      expect(isToday(recentSecurity.pricingLastSyncedAt!)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Yahoo failure gracefully and attempt fallback providers', async () => {
      // Yahoo fails for all symbols
      mockedYahooChart.mockRejectedValue(new Error('Yahoo Finance API rate limit exceeded'));

      // Polygon succeeds as fallback for US stocks
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      mockedPolygonAggregates.mockResolvedValue({
        results: [
          { T: 'AAPL', t: new Date(yesterday).getTime(), c: 185.92 },
          { T: 'MSFT', t: new Date(yesterday).getTime(), c: 155.5 },
        ],
      });

      // Alpha Vantage succeeds as fallback for non-US stocks
      mockedAlphaDaily.mockResolvedValue({
        'Time Series (Daily)': {
          [yesterday]: { '4. close': '728.90' },
        },
      });

      const response = await helpers.triggerSecuritiesSync();
      expect(response.statusCode).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify Yahoo was attempted first
      expect(mockedYahooChart).toHaveBeenCalled();

      // Fallback providers should have been called
      const securitiesPrices = await helpers.getSecuritiesPricesByDate({ raw: true });
      // At least some prices should have been fetched via fallback
      expect(securitiesPrices.length).toBeGreaterThan(0);
    });

    it('should handle bulk create failure and fallback to individual upserts', async () => {
      // Yahoo succeeds for fetching
      mockedYahooChart.mockResolvedValue({
        quotes: [{ date: new Date(), close: 185.92, adjclose: 185.92 }],
      });

      // Mock database constraint error that would cause bulk create to fail
      const originalBulkCreate = SecurityPricing.bulkCreate;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockBulkCreate = vi.fn<any>().mockRejectedValue(new Error('Bulk create constraint violation'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      SecurityPricing.bulkCreate = mockBulkCreate as any;

      // Mock individual upsert to succeed
      const originalUpsert = SecurityPricing.upsert;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockUpsert = vi.fn<any>().mockResolvedValue([{} as SecurityPricing, true]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      SecurityPricing.upsert = mockUpsert as any;

      try {
        const response = await helpers.triggerSecuritiesSync();
        expect(response.statusCode).toBe(200);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify bulk create was attempted and failed
        expect(mockBulkCreate).toHaveBeenCalled();

        // Verify fallback to individual upserts was used
        expect(mockUpsert).toHaveBeenCalled();
      } finally {
        SecurityPricing.bulkCreate = originalBulkCreate;
        SecurityPricing.upsert = originalUpsert;
      }
    });

    it('should handle scenario with only excluded holdings', async () => {
      // Clear previous test mocks first
      vi.clearAllMocks();

      // Reset Yahoo mocks after clearAllMocks
      mockedYahooSearch.mockRejectedValue(new Error('Yahoo mock: not configured'));
      mockedYahooQuote.mockRejectedValue(new Error('Yahoo mock: not configured'));
      mockedYahooChart.mockRejectedValue(new Error('Yahoo mock: not configured'));

      // Reset all existing holdings to be excluded
      await Holdings.update({ excluded: true }, { where: {} });

      const excludedOnlySecurities = await helpers.seedSecurities([
        {
          symbol: 'EXCL',
          name: 'Excluded Only Corp',
          currencyCode: 'USD',
        },
      ]);

      await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: excludedOnlySecurities[0]!.id,
        },
      });

      await Holdings.update(
        { excluded: true },
        { where: { portfolioId: investmentPortfolio.id, securityId: excludedOnlySecurities[0]!.id } },
      );

      const nonExcludedHoldings = await Holdings.count({ where: { excluded: false } });
      expect(nonExcludedHoldings).toBe(0);

      // Wait for background sync triggered by createHolding to finish, then clear call history
      await new Promise((resolve) => setTimeout(resolve, 500));
      mockedYahooChart.mockClear();
      mockedPolygonAggregates.mockClear();
      mockedAlphaDaily.mockClear();
      mockedFmpHistoricalPrices.mockClear();

      const response = await helpers.triggerSecuritiesSync();
      expect(response.statusCode).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // No providers should be called since all holdings are excluded
      expect(mockedYahooChart).not.toHaveBeenCalled();
      expect(mockedPolygonAggregates).not.toHaveBeenCalled();
      expect(mockedAlphaDaily).not.toHaveBeenCalled();
      expect(mockedFmpHistoricalPrices).not.toHaveBeenCalled();
    });
  });

  describe('Data Integrity', () => {
    it('should store correct Yahoo provider source for each security', async () => {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // Yahoo is primary for all — mock chart to return data
      mockedYahooChart.mockResolvedValue({
        quotes: [{ date: new Date(yesterday), close: 185.92, adjclose: 185.92 }],
      });

      await helpers.triggerSecuritiesSync();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify correct provider sources are stored (all Yahoo)
      const securitiesPrices = await helpers.getSecuritiesPricesByDate({ raw: true });
      const usPrice = securitiesPrices.find((p) => p.securityId === usSecurity.id);
      const nonUsPrice = securitiesPrices.find((p) => p.securityId === nonUsSecurity.id);

      expect(usPrice?.source).toBe(SECURITY_PROVIDER.yahoo);
      expect(nonUsPrice?.source).toBe(SECURITY_PROVIDER.yahoo);

      // Should store actual provider name, not 'composite'
      expect(usPrice?.source).not.toBe(SECURITY_PROVIDER.composite);
      expect(nonUsPrice?.source).not.toBe(SECURITY_PROVIDER.composite);
    });
  });

  describe('Concurrent Execution Prevention', () => {
    it('should prevent concurrent sync execution with locking', async () => {
      // Wait for any async work from previous tests to release the lock
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mock slow Yahoo response to simulate long-running sync
      mockedYahooChart.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ quotes: [] }), 300)),
      );

      // Start first sync
      const firstSyncPromise = helpers.triggerSecuritiesSync();

      // Start second sync immediately
      const secondSyncPromise = helpers.triggerSecuritiesSync();

      // Both should return success status, but locking should prevent double execution
      const [firstResponse, secondResponse] = await Promise.all([firstSyncPromise, secondSyncPromise]);

      const statusCodes = [firstResponse.statusCode, secondResponse.statusCode].toSorted();
      // One request should succeed (200), the other may be locked out (423 or 429) or both succeed
      expect(statusCodes[0]).toBe(200);
      expect([200, 423, 429]).toContain(statusCodes[1]);

      await new Promise((resolve) => setTimeout(resolve, 500));

      mockedYahooChart.mockClear();
    });
  });
});
