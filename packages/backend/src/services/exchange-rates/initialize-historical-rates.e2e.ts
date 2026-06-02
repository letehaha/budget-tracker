import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { logger } from '@js/utils';
import ExchangeRates from '@models/exchange-rates.model';
import { CURRENCY_RATES_API_ENDPOINT_REGEX, FRANKFURTER_ENDPOINT_REGEX } from '@tests/mocks/exchange-rates/endpoints';
import { createOverride } from '@tests/mocks/helpers';
import { format } from 'date-fns';

import { initializeHistoricalRates, providerAvailabilityConfig } from './initialize-historical-rates.service';
import { exchangeRateProviderRegistry } from './providers';
import { EXCHANGE_RATE_PROVIDER_TYPE } from './providers/types';

// logger.error is an overloaded fn, so jest infers its call args as `never`.
// Read the recorded calls through a widened tuple type for assertions.
const loggerErrorCalledWith = (errorSpy: ReturnType<typeof jest.spyOn>, substring: string): boolean =>
  (errorSpy.mock.calls as unknown as Array<[unknown, Record<string, unknown>?]>).some(
    ([arg]) => typeof arg === 'string' && arg.includes(substring),
  );

describe('Initialize Historical Rates Service', () => {
  let currencyRatesApiOverride: ReturnType<typeof createOverride>;
  let frankfurterOverride: ReturnType<typeof createOverride>;

  // Store original config values
  const originalMaxRetries = providerAvailabilityConfig.maxRetries;
  const originalRetryIntervalMs = providerAvailabilityConfig.retryIntervalMs;

  // Store seed exchange rates to restore after tests that destroy them
  let seedExchangeRates: { baseCode: string; quoteCode: string; rate: number; date: Date }[] = [];
  let originalSeedCount = 0;

  beforeAll(async () => {
    currencyRatesApiOverride = createOverride(global.mswMockServer, CURRENCY_RATES_API_ENDPOINT_REGEX);
    frankfurterOverride = createOverride(global.mswMockServer, FRANKFURTER_ENDPOINT_REGEX);

    // Use shorter retry intervals for tests
    providerAvailabilityConfig.maxRetries = 2;
    providerAvailabilityConfig.retryIntervalMs = 100; // 100ms instead of 30s

    // Save all seed exchange rates from the migration
    seedExchangeRates = (await ExchangeRates.findAll({
      raw: true,
    })) as typeof seedExchangeRates;
    originalSeedCount = seedExchangeRates.length;
  });

  afterEach(async () => {
    // Restore seed exchange rates if they were destroyed
    // This is necessary because some tests destroy all exchange rates,
    // but the global beforeEach needs them to set the base currency
    const currentCount = await ExchangeRates.count();

    if (currentCount < originalSeedCount && seedExchangeRates.length > 0) {
      // Clear any partial data and restore all seed rates
      await ExchangeRates.destroy({ where: {} });
      await ExchangeRates.bulkCreate(seedExchangeRates, {
        ignoreDuplicates: true,
      });
    }

    // Drop any logger spies installed by degradation-signal tests
    jest.restoreAllMocks();
  });

  afterAll(() => {
    // Restore original config values
    providerAvailabilityConfig.maxRetries = originalMaxRetries;
    providerAvailabilityConfig.retryIntervalMs = originalRetryIntervalMs;
  });

  it('should successfully load historical rates on initialization', async () => {
    // Clear any existing rates
    await ExchangeRates.destroy({ where: {} });

    // Call the initialization service
    await initializeHistoricalRates();

    // Verify rates were loaded
    const rates = await ExchangeRates.findAll({ raw: true });
    expect(rates.length).toBeGreaterThan(0);

    // Verify data structure
    rates.forEach((rate) => {
      expect(rate).toMatchObject({
        baseCode: expect.any(String),
        quoteCode: expect.any(String),
        rate: expect.any(Number),
        date: expect.any(Date),
      });
      expect(rate.baseCode).toBe('USD');
    });
  });

  it('should be idempotent - running twice should not duplicate data', async () => {
    // Clear any existing rates
    await ExchangeRates.destroy({ where: {} });

    // First run
    await initializeHistoricalRates();
    const firstRunCount = await ExchangeRates.count();
    expect(firstRunCount).toBeGreaterThan(0);

    // Second run - should not add duplicates
    await initializeHistoricalRates();
    const secondRunCount = await ExchangeRates.count();
    expect(secondRunCount).toBe(firstRunCount);
  });

  it('should handle provider errors gracefully without crashing', async () => {
    // Make all providers return 500 error
    currencyRatesApiOverride.setOneTimeOverride({ status: 500 });
    frankfurterOverride.setOneTimeOverride({ status: 500 });

    // Should not throw - just log error
    await expect(initializeHistoricalRates()).resolves.toBeUndefined();
  });

  it('should handle provider 404 error gracefully', async () => {
    // Make all providers return 404 error
    currencyRatesApiOverride.setOneTimeOverride({ status: 404 });
    frankfurterOverride.setOneTimeOverride({ status: 404 });

    // Should not throw - just log error
    await expect(initializeHistoricalRates()).resolves.toBeUndefined();
  });

  it('should handle invalid provider response gracefully', async () => {
    const startDate = exchangeRateProviderRegistry.getEarliestHistoricalDate();
    const startDateStr = startDate ? format(startDate, 'yyyy-MM-dd') : '1999-01-04';

    // Return invalid response (missing rates) from primary provider
    currencyRatesApiOverride.setOneTimeOverride({
      body: { base: 'USD', start_date: startDateStr, end_date: '2025-01-01' },
    });
    // Make Frankfurter also return invalid response
    frankfurterOverride.setOneTimeOverride({
      body: { base: 'USD', start_date: startDateStr, end_date: '2025-01-01' },
    });

    // Should not throw - just log error
    await expect(initializeHistoricalRates()).resolves.toBeUndefined();
  });

  it('should load rates from start date to current date', async () => {
    // Clear any existing rates
    await ExchangeRates.destroy({ where: {} });

    await initializeHistoricalRates();

    const rates = await ExchangeRates.findAll({
      attributes: ['date'],
      group: ['date'],
      raw: true,
    });

    // Should have at least 2 unique dates (start and end from our mock)
    expect(rates.length).toBeGreaterThanOrEqual(2);

    const dates = rates.map((r) => r.date);
    const startDate = exchangeRateProviderRegistry.getEarliestHistoricalDate();
    expect(startDate).not.toBeNull();
    const startDateStr = format(startDate!, 'yyyy-MM-dd');

    // Check if rates include the start date (from mock)
    const hasStartDate = dates.some((date) => format(new Date(date), 'yyyy-MM-dd') === startDateStr);
    expect(hasStartDate).toBe(true);
  });

  it('should correctly save all rate fields to database', async () => {
    // Clear any existing rates
    await ExchangeRates.destroy({ where: {} });

    await initializeHistoricalRates();

    const sampleRate = await ExchangeRates.findOne({ raw: true });
    expect(sampleRate).toBeTruthy();
    expect(sampleRate!.baseCode).toBe('USD');
    expect(sampleRate!.quoteCode).toMatch(/^[A-Z]{3}$/); // 3-letter currency code
    expect(sampleRate!.rate).toBeGreaterThan(0);
    expect(sampleRate!.date).toBeInstanceOf(Date);
    // `source` must reflect the provider that supplied the rate, not the
    // UNKNOWN fallback — protects against providerType being dropped from
    // the insert path in a future refactor.
    expect(sampleRate!.source).not.toBe(EXCHANGE_RATE_PROVIDER_TYPE.UNKNOWN);
    expect(Object.values(EXCHANGE_RATE_PROVIDER_TYPE)).toContain(sampleRate!.source);
  });

  it('attributes backfilled rates to the highest-priority provider that supplied them', async () => {
    // Both historical providers (Currency Rates API p1, Frankfurter p2) are healthy.
    // The primary's mock is a superset of Frankfurter's, so the per-date merge must
    // attribute EVERY row to the primary — proving priority precedence holds in the
    // historical path (a lower-priority value never overwrites a higher-priority one).
    await ExchangeRates.destroy({ where: {} });

    await initializeHistoricalRates();

    const rates = await ExchangeRates.findAll({ raw: true });
    expect(rates.length).toBeGreaterThan(0);
    rates.forEach((rate) => {
      expect(rate.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API);
    });
  });

  it('reports a Sentry event (logger.error) when a historical provider is unavailable', async () => {
    const errorSpy = jest.spyOn(logger, 'error');
    // Primary stays healthy and backfills the data; the secondary provider fails its
    // health check (500), so it is skipped by isAvailable(). That degradation used to
    // go unreported on the historical path (only `failed`, never `unavailable`, was
    // signalled) — the exact asymmetry this guards against.
    frankfurterOverride.setOverride({ status: 500 });

    await initializeHistoricalRates();

    expect(loggerErrorCalledWith(errorSpy, 'Historical backfill degraded')).toBe(true);
  });

  it('should work as a fire-and-forget operation (non-blocking startup pattern)', async () => {
    // Clear any existing rates
    await ExchangeRates.destroy({ where: {} });

    // Simulate startup pattern - call without await
    const promise = initializeHistoricalRates();

    // This simulates that the app continues to start up
    // The function should be running in background
    expect(promise).toBeInstanceOf(Promise);

    // Wait for it to complete (in real app, this happens in background)
    await promise;

    // Verify it still loaded data
    const count = await ExchangeRates.count();
    expect(count).toBeGreaterThan(0);
  });

  it('should not crash the app even if initialization fails (fire-and-forget safety)', async () => {
    // Make all providers return error
    currencyRatesApiOverride.setOneTimeOverride({ status: 500 });
    frankfurterOverride.setOneTimeOverride({ status: 500 });

    // Call without await - simulating startup
    const promise = initializeHistoricalRates();

    // Should not throw
    await expect(promise).resolves.toBeUndefined();

    // App should continue running normally (no crash)
    expect(true).toBe(true);
  });
});
