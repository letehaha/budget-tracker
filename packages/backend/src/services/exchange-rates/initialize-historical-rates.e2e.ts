import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import ExchangeRates from '@models/exchange-rates.model';
import { CURRENCY_RATES_API_ENDPOINT_REGEX } from '@tests/mocks/exchange-rates/endpoints';
import { createOverride } from '@tests/mocks/helpers';
import { format } from 'date-fns';

import { initializeHistoricalRates, providerAvailabilityConfig } from './initialize-historical-rates.service';
import { exchangeRateProviderRegistry } from './providers';
import { EXCHANGE_RATE_PROVIDER_TYPE } from './providers/types';

describe('Initialize Historical Rates Service', () => {
  let currencyRatesApiOverride: ReturnType<typeof createOverride>;

  // Store original config values
  const originalMaxRetries = providerAvailabilityConfig.maxRetries;
  const originalRetryIntervalMs = providerAvailabilityConfig.retryIntervalMs;

  // Store seed exchange rates to restore after tests that destroy them
  let seedExchangeRates: { baseCode: string; quoteCode: string; rate: number; date: Date }[] = [];
  let originalSeedCount = 0;

  beforeAll(async () => {
    currencyRatesApiOverride = createOverride(global.mswMockServer, CURRENCY_RATES_API_ENDPOINT_REGEX);

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

  it('backfills historical rates non-blockingly, attributed to the provider that supplied them', async () => {
    await ExchangeRates.destroy({ where: {} });

    // Startup calls this un-awaited, so it must return a promise instead of blocking boot.
    const promise = initializeHistoricalRates();
    expect(promise).toBeInstanceOf(Promise);
    await promise;

    const rates = await ExchangeRates.findAll({ raw: true });
    expect(rates.length).toBeGreaterThan(0);

    rates.forEach((rate) => {
      expect(rate).toMatchObject({
        baseCode: expect.any(String),
        quoteCode: expect.any(String),
        rate: expect.any(Number),
        date: expect.any(Date),
      });
      expect(rate.baseCode).toBe('USD');
      // Currency Rates API (priority 1) is the only registered historical provider, so
      // every row must carry its source rather than the UNKNOWN fallback.
      expect(rate.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API);
    });

    const sampleRate = rates[0]!;
    expect(sampleRate.quoteCode).toMatch(/^[A-Z]{3}$/);
    expect(sampleRate.rate).toBeGreaterThan(0);
    expect(sampleRate.date).toBeInstanceOf(Date);
    expect(sampleRate.source).not.toBe(EXCHANGE_RATE_PROVIDER_TYPE.UNKNOWN);
    expect(Object.values(EXCHANGE_RATE_PROVIDER_TYPE)).toContain(sampleRate.source);

    const dates = [...new Set(rates.map((rate) => format(new Date(rate.date), 'yyyy-MM-dd')))];
    expect(dates.length).toBeGreaterThanOrEqual(2);

    const startDate = exchangeRateProviderRegistry.getEarliestHistoricalDate();
    expect(startDate).not.toBeNull();
    expect(dates).toContain(format(startDate!, 'yyyy-MM-dd'));
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

  it('never rejects when the provider fails or answers with a malformed body', async () => {
    currencyRatesApiOverride.setOneTimeOverride({ status: 500 });
    await expect(initializeHistoricalRates()).resolves.toBeUndefined();

    currencyRatesApiOverride.setOneTimeOverride({ status: 404 });
    await expect(initializeHistoricalRates()).resolves.toBeUndefined();

    const startDate = exchangeRateProviderRegistry.getEarliestHistoricalDate();
    const startDateStr = startDate ? format(startDate, 'yyyy-MM-dd') : '1999-01-04';
    currencyRatesApiOverride.setOneTimeOverride({
      body: { base: 'USD', start_date: startDateStr, end_date: '2025-01-01' },
    });
    await expect(initializeHistoricalRates()).resolves.toBeUndefined();

    // An un-awaited failing run must still resolve so startup sees no unhandled rejection.
    currencyRatesApiOverride.setOneTimeOverride({ status: 500 });
    const promise = initializeHistoricalRates();
    await expect(promise).resolves.toBeUndefined();
  });
});
