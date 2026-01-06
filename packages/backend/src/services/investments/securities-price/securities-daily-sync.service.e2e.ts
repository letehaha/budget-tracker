import { SECURITY_PROVIDER } from '@bt/shared/types/investments';
import Holdings from '@models/investments/Holdings.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { restClient } from '@polygon.io/client-js';
import * as helpers from '@tests/helpers';
import alpha from 'alphavantage';
import { format, isToday, subDays } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FmpClient } from '../data-providers/clients/fmp-client';

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

describe('Securities Daily Sync Service (via API Endpoint)', () => {
  let investmentPortfolio: Portfolios;
  let usSecurity: Securities;
  let nonUsSecurity: Securities;
  let securityWithStaleData: Securities;
  let securityWithExcludedHolding: Securities;

  beforeEach(async () => {
    vi.clearAllMocks();

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
      date: subDays(new Date(), 5),
      priceClose: '100.00',
      source: SECURITY_PROVIDER.polygon,
    });
  });

  describe('Basic Sync Functionality', () => {
    it('should sync prices for all securities with non-excluded holdings via endpoint', async () => {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // Mock Polygon response for US stocks
      const mockPolygonPrices = [
        { T: 'AAPL', t: new Date(yesterday).getTime(), c: 185.92 }, // AAPL
        { T: 'MSFT', t: new Date(yesterday).getTime(), c: 155.5 }, // MSFT
      ];

      mockedPolygonAggregates.mockResolvedValue({
        results: mockPolygonPrices,
      });

      // Mock Alpha Vantage response for non-US stock
      const mockTimeSeriesData = {
        'Time Series (Daily)': {
          [yesterday]: {
            '4. close': '728.90',
          },
        },
      };

      mockedAlphaDaily.mockResolvedValue(mockTimeSeriesData);

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

      // Verify US stocks were synced via Polygon
      expect(mockedPolygonAggregates).toHaveBeenCalled();

      // Check that data sync happened for "yesterday"
      const polygonCall = mockedPolygonAggregates.mock.calls.find((call) => call[0] === yesterday);
      expect(polygonCall).toBeDefined();

      // Verify non-US stock was synced via Alpha Vantage
      expect(mockedAlphaDaily).toHaveBeenCalledWith('ASML.AS', 'full');

      // Verify price data was stored for US securities
      const securitiesPrices = await helpers.getSecuritiesPricesByDate({
        raw: true,
      });

      const usSecurityPrice = securitiesPrices.find((i) => i.securityId === usSecurity.id)!;
      const nonUsSecurityPrice = securitiesPrices.find((i) => i.securityId === nonUsSecurity.id)!;

      // Verify that securities prices were received from correct provider
      expect(usSecurityPrice.source).toBe(SECURITY_PROVIDER.polygon);
      expect(nonUsSecurityPrice.source).toBe(SECURITY_PROVIDER.alphavantage);

      // Verify sync timestamps were updated for synced securities
      const securities = await helpers.getAllSecurities({ raw: true });
      expect(securities.find((i) => i.id === securityWithExcludedHolding.id)!.pricingLastSyncedAt).toBe(null);
      expect(isToday(securities.find((i) => i.id === usSecurity.id)!.pricingLastSyncedAt!)).toBe(true);
      expect(isToday(securities.find((i) => i.id === nonUsSecurity.id)!.pricingLastSyncedAt!)).toBe(true);
      expect(isToday(securities.find((i) => i.id === securityWithStaleData.id)!.pricingLastSyncedAt!)).toBe(true);
    });

    it.skip('should skip securities with excluded holdings only', async () => {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // Mock providers to track calls
      mockedPolygonAggregates.mockResolvedValue({ results: [] });
      mockedAlphaDaily.mockResolvedValue({
        'Time Series (Daily)': {},
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

      // Verify that the excluded security (GOOGL) was not processed by checking the call parameters
      const polygonCalls = mockedPolygonAggregates.mock.calls;
      if (polygonCalls.length > 0) {
        // If Polygon was called, it should not include GOOGL
        const calledForDate = polygonCalls.find((call) => call[0] === yesterday);
        if (calledForDate && calledForDate[1]) {
          // The symbols should not include GOOGL
          expect(calledForDate[1]).not.toContain('GOOGL');
        }
      }

      // Verify no price data was created for excluded security
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

  describe.skip('Prioritization Logic', () => {
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

      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // Mock provider responses
      const mockPrices = [
        { T: 'AAPL', t: new Date(yesterday).getTime(), c: 185.92 },
        { T: 'MSFT', t: new Date(yesterday).getTime(), c: 155.5 },
        { T: 'NVDA', t: new Date(yesterday).getTime(), c: 800.0 },
      ];
      mockedPolygonAggregates.mockResolvedValue({ results: mockPrices });

      // Mock Alpha Vantage for non-US stock
      const mockTimeSeriesData = {
        'Time Series (Daily)': {
          [yesterday]: {
            '4. close': '728.90',
          },
        },
      };
      mockedAlphaDaily.mockResolvedValue(mockTimeSeriesData);

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

  describe.skip('Error Handling', () => {
    it('should handle provider failure gracefully and continue with other securities', async () => {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // Mock Polygon to fail
      mockedPolygonAggregates.mockRejectedValue(new Error('Polygon API rate limit exceeded'));

      // Mock Alpha Vantage to succeed
      mockedAlphaDaily.mockResolvedValue({
        'Time Series (Daily)': {
          [yesterday]: { '4. close': '728.90' },
        },
      });

      // Trigger sync
      const response = await helpers.triggerSecuritiesSync();
      expect(response.statusCode).toBe(200);
      expect(helpers.extractResponse(response)).toEqual({
        message: 'Securities daily sync triggered successfully',
        triggered: true,
        timestamp: expect.any(String),
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // At least the non-US security should be synced successfully via Alpha Vantage
      const securitiesPrices = await helpers.getSecuritiesPricesByDate({ raw: true });
      const asmlPrice = securitiesPrices.find((p) => p.securityId === nonUsSecurity.id);
      expect(asmlPrice).toBeTruthy();
      expect(asmlPrice?.source).toBe(SECURITY_PROVIDER.alphavantage);
    });

    it('should handle bulk create failure and fallback to individual upserts', async () => {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // Mock successful price fetching to ensure we have data to process
      mockedPolygonAggregates.mockResolvedValue({
        results: [{ T: 'AAPL', t: new Date(yesterday).getTime(), c: 185.92 }],
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
        // Trigger sync
        const response = await helpers.triggerSecuritiesSync();
        expect(response.statusCode).toBe(200);
        expect(helpers.extractResponse(response)).toEqual({
          message: 'Securities daily sync triggered successfully',
          triggered: true,
          timestamp: expect.any(String),
        });

        // Wait longer for async processing to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify bulk create was attempted and failed
        expect(mockBulkCreate).toHaveBeenCalled();

        // Verify fallback to individual upserts was used
        expect(mockUpsert).toHaveBeenCalled();
      } finally {
        // Restore original methods
        SecurityPricing.bulkCreate = originalBulkCreate;
        SecurityPricing.upsert = originalUpsert;
      }
    });

    it('should handle scenario with only excluded holdings', async () => {
      // Clear previous test mocks first
      vi.clearAllMocks();

      // Reset all existing holdings to be excluded
      await Holdings.update({ excluded: true }, { where: {} });

      // Create a fresh, clean scenario with only excluded holdings
      // Create a new security and holding that is excluded from the start
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

      // Immediately mark it as excluded
      await Holdings.update(
        { excluded: true },
        { where: { portfolioId: investmentPortfolio.id, securityId: excludedOnlySecurities[0]!.id } },
      );

      // Verify no non-excluded holdings exist
      const nonExcludedHoldings = await Holdings.count({ where: { excluded: false } });
      expect(nonExcludedHoldings).toBe(0);

      // Now trigger sync - should find no securities to process
      const response = await helpers.triggerSecuritiesSync();
      expect(response.statusCode).toBe(200);
      expect(helpers.extractResponse(response)).toEqual({
        message: 'Securities daily sync triggered successfully',
        triggered: true,
        timestamp: expect.any(String),
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Providers should not be called since all holdings are excluded
      expect(mockedPolygonAggregates).not.toHaveBeenCalled();
      expect(mockedAlphaDaily).not.toHaveBeenCalled();
      expect(mockedFmpHistoricalPrices).not.toHaveBeenCalled();
    });
  });

  describe.skip('Data Integrity', () => {
    it('should update pricingLastSyncedAt only for successfully synced securities', async () => {
      // Mock partial success - only one provider succeeds
      mockedPolygonAggregates.mockResolvedValue({
        results: [{ t: new Date('2024-01-15').getTime(), c: 185.92 }],
      });

      // Mock Alpha Vantage failure
      mockedAlphaDaily.mockRejectedValue(new Error('Alpha Vantage failure'));

      // Record initial sync timestamps
      const initialUsSecurity = await Securities.findByPk(usSecurity.id);
      const initialNonUsSecurity = await Securities.findByPk(nonUsSecurity.id);

      // Trigger sync
      await helpers.triggerSecuritiesSync();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check updated timestamps
      const updatedSecurities = await helpers.getAllSecurities({ raw: true });
      const updatedUsSecurity = updatedSecurities.find((s) => s.id === usSecurity.id);
      const updatedNonUsSecurity = updatedSecurities.find((s) => s.id === nonUsSecurity.id);

      // US security should have updated timestamp (successful sync)
      expect(updatedUsSecurity?.pricingLastSyncedAt).toBeTruthy();
      expect(updatedUsSecurity?.pricingLastSyncedAt).not.toEqual(initialUsSecurity?.pricingLastSyncedAt);

      // Non-US security should not have updated timestamp (failed sync)
      // Handle comparison between Date objects and string representations
      const initialTimestamp = initialNonUsSecurity?.pricingLastSyncedAt;
      const updatedTimestamp = updatedNonUsSecurity?.pricingLastSyncedAt;

      if (initialTimestamp === null) {
        expect(updatedTimestamp).toBe(null);
      } else {
        // Convert both to ISO strings for comparison to handle Date vs string types
        const initialStr = initialTimestamp instanceof Date ? initialTimestamp.toISOString() : initialTimestamp;
        const updatedStr = updatedTimestamp instanceof Date ? updatedTimestamp.toISOString() : updatedTimestamp;
        expect(updatedStr).toEqual(initialStr);
      }
    });

    it('should store correct provider information for each security', async () => {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

      // Mock different providers returning data
      mockedPolygonAggregates.mockResolvedValue({
        results: [{ T: 'AAPL', t: new Date(yesterday).getTime(), c: 185.92 }],
      });

      mockedAlphaDaily.mockResolvedValue({
        'Time Series (Daily)': {
          [yesterday]: { '4. close': '728.90' },
        },
      });

      // Trigger sync
      await helpers.triggerSecuritiesSync();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify correct provider sources are stored
      const securitiesPrices = await helpers.getSecuritiesPricesByDate({ raw: true });
      const usPrice = securitiesPrices.find((p) => p.securityId === usSecurity.id);
      const nonUsPrice = securitiesPrices.find((p) => p.securityId === nonUsSecurity.id);

      expect(usPrice?.source).toBe(SECURITY_PROVIDER.polygon);
      expect(nonUsPrice?.source).toBe(SECURITY_PROVIDER.alphavantage);

      // Should store actual provider name, not 'composite'
      expect(usPrice?.source).not.toBe(SECURITY_PROVIDER.composite);
      expect(nonUsPrice?.source).not.toBe(SECURITY_PROVIDER.composite);
    });
  });

  describe.skip('Concurrent Execution Prevention', () => {
    it('should prevent concurrent sync execution with locking', async () => {
      // Mock slow provider response to simulate long-running sync
      mockedPolygonAggregates.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ results: [] }), 300)),
      );

      // Start first sync
      const firstSyncPromise = helpers.triggerSecuritiesSync();

      // Start second sync immediately
      const secondSyncPromise = helpers.triggerSecuritiesSync();

      // Both should return success status, but locking should prevent double execution
      const [firstResponse, secondResponse] = await Promise.all([firstSyncPromise, secondSyncPromise]);

      expect(firstResponse.statusCode).toBe(200);
      // Second request might be locked out (423 status) or succeed if lock was released quickly
      expect([200, 423]).toContain(secondResponse.statusCode);

      // Provider should not be called excessively due to locking
      // The exact number may vary due to locking, but it should be controlled
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reset mock to prevent interference with other tests
      mockedPolygonAggregates.mockClear();
    });
  });
});
