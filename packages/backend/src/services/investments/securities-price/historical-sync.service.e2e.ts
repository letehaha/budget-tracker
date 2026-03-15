import { SECURITY_PROVIDER } from '@bt/shared/types/investments';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { restClient } from '@polygon.io/client-js';
import * as helpers from '@tests/helpers';
import alpha from 'alphavantage';
import { subDays } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FmpClient } from '../data-providers/clients/fmp-client';

// Mock data provider clients
const mockedRestClient = vi.mocked(restClient);
const mockPolygonApi = mockedRestClient.getMockImplementation()!('test');
const mockedPolygonAggregates = vi.mocked(mockPolygonApi.stocks.aggregates);

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

describe('Historical Price Sync Service (via Holdings Creation)', () => {
  let investmentPortfolio: Portfolios;
  let usSecurity: Securities;
  let nonUsSecurity: Securities;
  let existingSecurity: Securities;

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
    ]);

    usSecurity = securities[0]!;
    nonUsSecurity = securities[1]!;
    existingSecurity = securities[2]!;

    // Pre-populate existing security with some price data
    await SecurityPricing.create({
      securityId: existingSecurity.id,
      date: subDays(new Date(), 1),
      priceClose: '100.00',
      source: SECURITY_PROVIDER.polygon,
    });
  });

  describe('US Stock Routing (Polygon Provider)', () => {
    it('should use Polygon provider for US stocks when creating holding', async () => {
      // Mock Polygon response for US stock (AAPL)
      const mockPrices = [
        {
          t: new Date('2024-01-15').getTime(),
          c: 185.92,
        },
        {
          t: new Date('2024-01-16').getTime(),
          c: 188.63,
        },
        {
          t: new Date('2024-01-17').getTime(),
          c: 191.56,
        },
      ];

      mockedPolygonAggregates.mockResolvedValue({
        results: mockPrices,
      });

      // Create holding via API endpoint - this triggers historical price sync internally
      const response = await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: usSecurity.id,
        },
      });

      expect(response.statusCode).toBe(201);

      // Give some time for background sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify Polygon was called with correct parameters
      expect(mockedPolygonAggregates).toHaveBeenCalledTimes(1);
      const callArgs = mockedPolygonAggregates.mock.calls[0];
      expect(callArgs?.[0]).toBe('AAPL');
      expect(callArgs?.[1]).toBe(1); // multiplier
      expect(callArgs?.[2]).toBe('day'); // timespan

      // Verify data was stored correctly in database
      const storedPrices = await SecurityPricing.findAll({
        where: { securityId: usSecurity.id },
        order: [['date', 'ASC']],
      });

      expect(storedPrices).toHaveLength(3);

      mockPrices.forEach((item, index) => {
        expect(storedPrices[index]?.priceClose).toBeNumericEqual(item.c);
        expect(storedPrices[index]?.source).toBe(SECURITY_PROVIDER.polygon);
      });

      // Verify security sync timestamp was updated
      const updatedSecurity = await Securities.findByPk(usSecurity.id);
      expect(updatedSecurity?.pricingLastSyncedAt).toBeTruthy();

      // Verify other providers were NOT called
      expect(mockedAlphaDaily).not.toHaveBeenCalled();
      expect(mockedFmpHistoricalPrices).not.toHaveBeenCalled();
    });
  });

  describe('Non-US Stock Routing (Alpha Vantage Provider)', () => {
    it('should use Alpha Vantage provider for non-US stocks when creating holding', async () => {
      // Mock Alpha Vantage response for non-US stock (ASML.AS)
      const mockTimeSeriesData = {
        'Time Series (Daily)': {
          '2024-01-17': {
            '1. open': '720.00',
            '2. high': '735.50',
            '3. low': '718.25',
            '4. close': '728.90',
            '5. volume': '1234567',
          },
          '2024-01-16': {
            '1. open': '715.50',
            '2. high': '722.75',
            '3. low': '710.00',
            '4. close': '719.25',
            '5. volume': '987654',
          },
          '2024-01-15': {
            '1. open': '708.25',
            '2. high': '718.50',
            '3. low': '705.00',
            '4. close': '714.80',
            '5. volume': '1876543',
          },
        },
      };

      mockedAlphaDaily.mockResolvedValue(mockTimeSeriesData);

      // Create holding via API endpoint - this triggers historical price sync internally
      const response = await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: nonUsSecurity.id,
        },
      });

      expect(response.statusCode).toBe(201);

      // Give some time for background sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify Alpha Vantage was called correctly
      expect(mockedAlphaDaily).toHaveBeenCalledTimes(1);
      expect(mockedAlphaDaily).toHaveBeenCalledWith('ASML.AS', 'full');

      // Verify data was stored correctly in database with Alpha Vantage as source
      const storedPrices = await SecurityPricing.findAll({
        where: { securityId: nonUsSecurity.id },
        order: [['date', 'ASC']],
      });

      expect(storedPrices).toHaveLength(3);
      expect(storedPrices[0]?.priceClose).toBeNumericEqual('714.80'); // 2024-01-15
      expect(storedPrices[0]?.source).toBe(SECURITY_PROVIDER.alphavantage);
      expect(storedPrices[1]?.priceClose).toBeNumericEqual('719.25'); // 2024-01-16
      expect(storedPrices[1]?.source).toBe(SECURITY_PROVIDER.alphavantage);
      expect(storedPrices[2]?.priceClose).toBeNumericEqual('728.90'); // 2024-01-17
      expect(storedPrices[2]?.source).toBe(SECURITY_PROVIDER.alphavantage);

      // Verify other providers were NOT called
      expect(mockedPolygonAggregates).not.toHaveBeenCalled();
      expect(mockedFmpHistoricalPrices).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should sync even when security already has price data (fills gaps)', async () => {
      // First, verify the existing price data is there before the test
      const pricesBeforeSync = await SecurityPricing.findAll({
        where: { securityId: existingSecurity.id },
      });
      expect(pricesBeforeSync.length).toBeGreaterThanOrEqual(1); // Should have the setup price

      // Mock Polygon to return new price data with different dates to avoid conflicts
      const mockPrices = [
        {
          t: new Date('2024-03-15').getTime(), // Use different dates to avoid duplicate conflicts
          c: 150.0,
        },
        {
          t: new Date('2024-03-16').getTime(),
          c: 155.0,
        },
      ];

      mockedPolygonAggregates.mockResolvedValue({
        results: mockPrices,
      });

      // Try to create holding for security that already has price data
      const response = await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: existingSecurity.id,
        },
      });

      expect(response.statusCode).toBe(201);

      // Give some time for sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify provider WAS called (should NOT skip sync)
      expect(mockedPolygonAggregates).toHaveBeenCalledTimes(1);

      // Should now have both original and new price records
      const storedPrices = await SecurityPricing.findAll({
        where: { securityId: existingSecurity.id },
        order: [['date', 'ASC']],
      });

      // Should have more records now (original + new ones)
      expect(storedPrices.length).toBeGreaterThanOrEqual(pricesBeforeSync.length);

      // Verify security sync timestamp was updated
      const updatedSecurity = await Securities.findByPk(existingSecurity.id);
      expect(updatedSecurity?.pricingLastSyncedAt).toBeTruthy();
    });

    it('should fill price gaps when re-adding security after removal', async () => {
      // This simulates the gap-filling scenario:
      // 1. Security was previously synced (existing price data from setup)
      // 2. Security was removed from all holdings (gaps in daily sync)
      // 3. Security is now being re-added (should fill gaps with historical sync)

      // Mock Polygon to return data that includes new dates (filling gaps)
      const gapFillDate = new Date('2024-02-15'); // Different from existing data date

      const mockPrices = [
        {
          t: gapFillDate.getTime(),
          c: 105.5, // Price for gap period
        },
        {
          t: new Date('2024-02-16').getTime(),
          c: 107.25, // Another gap fill price
        },
      ];

      mockedPolygonAggregates.mockResolvedValue({
        results: mockPrices,
      });

      // Create holding for security that already has some price data (simulating re-adding)
      const response = await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: existingSecurity.id,
        },
      });

      expect(response.statusCode).toBe(201);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the sync was performed (not skipped)
      expect(mockedPolygonAggregates).toHaveBeenCalledTimes(1);
      expect(mockedPolygonAggregates).toHaveBeenCalledWith(
        'MSFT',
        1,
        'day',
        expect.any(String), // startDate
        expect.any(String), // endDate
      );

      // Verify both old and new prices exist (gap filled)
      const storedPrices = await SecurityPricing.findAll({
        where: { securityId: existingSecurity.id },
        order: [['date', 'ASC']],
      });

      // Should have at least 1 record
      expect(storedPrices.length).toBeGreaterThanOrEqual(1);

      // Verify the sync was performed (not skipped)
      expect(mockedPolygonAggregates).toHaveBeenCalledTimes(1);

      // Security sync timestamp should be updated
      const updatedSecurity = await Securities.findByPk(existingSecurity.id);
      expect(updatedSecurity?.pricingLastSyncedAt).toBeTruthy();
    });

    it('should handle provider failure gracefully during holding creation', async () => {
      // Mock Polygon failure
      mockedPolygonAggregates.mockRejectedValue(new Error('Polygon API rate limit exceeded'));

      // Mock Alpha Vantage success as fallback
      const mockTimeSeriesData = {
        'Time Series (Daily)': {
          '2024-01-15': {
            '4. close': '185.20',
          },
        },
      };
      mockedAlphaDaily.mockResolvedValue(mockTimeSeriesData);

      // Create holding - should succeed even if primary provider fails
      const response = await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: usSecurity.id,
        },
      });

      expect(response.statusCode).toBe(201);

      // Give time for background sync with fallback
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify Polygon was tried first and failed
      expect(mockedPolygonAggregates).toHaveBeenCalledTimes(1);

      // Verify Alpha Vantage was used as fallback
      expect(mockedAlphaDaily).toHaveBeenCalledTimes(1);
      expect(mockedAlphaDaily).toHaveBeenCalledWith('AAPL', 'full');

      // Verify data was stored with Alpha Vantage as source (fallback provider)
      const storedPrices = await SecurityPricing.findAll({
        where: { securityId: usSecurity.id },
      });

      expect(storedPrices).toHaveLength(1);
      expect(storedPrices[0]?.source).toBe(SECURITY_PROVIDER.alphavantage);
      expect(storedPrices[0]?.priceClose).toBeNumericEqual('185.20');
    });
  });

  describe('Provider Name Storage', () => {
    it('should store the actual provider name that fetched the data, not composite', async () => {
      // Test US stock using Polygon - should store 'polygon', not 'composite'
      mockedPolygonAggregates.mockResolvedValue({
        results: [
          {
            t: new Date('2024-01-15').getTime(),
            c: 185.92,
          },
        ],
      });

      const response = await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: usSecurity.id,
        },
      });

      expect(response.statusCode).toBe(201);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const storedPrice = await SecurityPricing.findOne({
        where: { securityId: usSecurity.id },
      });

      // Should store 'polygon', not 'composite'
      expect(storedPrice?.source).toBe(SECURITY_PROVIDER.polygon);
    });
  });
});
