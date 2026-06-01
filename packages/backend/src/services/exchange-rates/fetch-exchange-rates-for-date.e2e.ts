import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '@js/utils';
import { connection } from '@models/index';
import * as helpers from '@tests/helpers';
import {
  getApiLayerResposeMock,
  getCurrencyRatesApiResponseMock,
  getFrankfurterResponseMock,
} from '@tests/mocks/exchange-rates/data';
import { createCallsCounter, createOverride } from '@tests/mocks/helpers';
import { format, startOfDay } from 'date-fns';

import {
  API_LAYER_ENDPOINT_REGEX,
  CURRENCY_RATES_API_ENDPOINT_REGEX,
  FRANKFURTER_ENDPOINT_REGEX,
} from './fetch-exchange-rates-for-date';
import { EXCHANGE_RATE_PROVIDER_TYPE } from './providers/types';

describe('Exchange Rates Functionality', () => {
  let currencyRatesApiOverride: ReturnType<typeof createOverride>;
  let frankfurterOverride: ReturnType<typeof createOverride>;
  let apiLayerOverride: ReturnType<typeof createOverride>;

  let currencyRatesApiCounter: ReturnType<typeof createCallsCounter>;
  let frankfurterCounter: ReturnType<typeof createCallsCounter>;
  let apiLayerCounter: ReturnType<typeof createCallsCounter>;

  beforeAll(() => {
    currencyRatesApiOverride = createOverride(global.mswMockServer, CURRENCY_RATES_API_ENDPOINT_REGEX);
    frankfurterOverride = createOverride(global.mswMockServer, FRANKFURTER_ENDPOINT_REGEX);
    apiLayerOverride = createOverride(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);

    currencyRatesApiCounter = createCallsCounter(global.mswMockServer, CURRENCY_RATES_API_ENDPOINT_REGEX);
    frankfurterCounter = createCallsCounter(global.mswMockServer, FRANKFURTER_ENDPOINT_REGEX);
    apiLayerCounter = createCallsCounter(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);
  });

  beforeEach(async () => {
    // Clean up today's exchange rates before each test to ensure tests start fresh
    // This is needed because ExchangeRates table is preserved between tests for performance
    const today = startOfDay(new Date());
    await connection.sequelize.query(`DELETE FROM "ExchangeRates" WHERE date >= :today`, { replacements: { today } });
  });

  afterEach(() => {
    // Reset handlers to defaults after each test
    global.mswMockServer.resetHandlers();
    // Reset call counters
    currencyRatesApiCounter.reset();
    frankfurterCounter.reset();
    apiLayerCounter.reset();
    // Drop any logger spies installed by degradation-signal tests
    jest.restoreAllMocks();
  });

  // logger.error is an overloaded fn, so jest infers its call args as `never`.
  // Read the recorded calls through a widened tuple type for assertions.
  const loggerErrorCalls = (errorSpy: ReturnType<typeof jest.spyOn>): Array<[unknown, Record<string, unknown>?]> =>
    errorSpy.mock.calls as unknown as Array<[unknown, Record<string, unknown>?]>;

  // Returns true if logger.error was called with a message containing `substring`.
  const loggerErrorCalledWith = (errorSpy: ReturnType<typeof jest.spyOn>, substring: string): boolean =>
    loggerErrorCalls(errorSpy).some(([arg]) => typeof arg === 'string' && arg.includes(substring));

  it('should successfully fetch and store exchange rates using modular provider system', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');

    await expect(helpers.getExchangeRates({ date, raw: true })).resolves.toBe(null);
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);

    response.forEach((item) => {
      expect(item).toMatchObject({
        date: expect.stringContaining(date),
      });
      // `source` must be populated with a real provider — guards against
      // the providerType being silently dropped from the insert path.
      expect(item.source).not.toBe(EXCHANGE_RATE_PROVIDER_TYPE.UNKNOWN);
      expect(Object.values(EXCHANGE_RATE_PROVIDER_TYPE)).toContain(item.source);
    });
  });

  it('should fill currencies missing from the primary provider using lower-priority fallbacks', async () => {
    // Real-world bug: Currency Rates API (priority 1) only covers ~38 currencies
    // and succeeds every day, so the chain used to stop there and never reach
    // ApiLayer. Exotic currencies (ETB, HNL, PEN, RSD, TZS, XAF) that ONLY
    // ApiLayer provides were therefore never refreshed. The fallback must MERGE
    // providers — filling gaps left by higher-priority ones — instead of
    // returning on first success.
    const date = format(new Date(), 'yyyy-MM-dd');

    // All providers available with their default mocks (no overrides).
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    const byQuote = new Map(response.map((row) => [row.quoteCode, row]));

    // Present in ApiLayer's mock but absent from Currency Rates API's mock.
    for (const exotic of ['ETB', 'HNL', 'PEN', 'RSD', 'TZS', 'XAF']) {
      const row = byQuote.get(exotic);
      expect(row).toBeTruthy();
      expect(row!.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER);
    }

    // Currencies the primary provider covers must keep its (higher-priority) source.
    expect(byQuote.get('EUR')?.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API);
    expect(byQuote.get('UAH')?.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API);
  });

  it('keeps the higher-priority provider value when two providers supply the same currency', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');
    const primaryEur = getCurrencyRatesApiResponseMock(date).rates.EUR;

    // ApiLayer (priority 3) returns a DIFFERENT EUR value. The primary must win on
    // the VALUE, not just the source label — guards the dedup precedence path.
    apiLayerOverride.setOverride({
      body: { ...getApiLayerResposeMock(date), rates: { ...getApiLayerResposeMock(date).rates, EUR: 0.123456 } },
    });

    await helpers.syncExchangeRates();

    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    const eur = response.find((r) => r.quoteCode === 'EUR')!;
    expect(eur.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API);
    expect(eur.rate).toBeCloseTo(primaryEur, 6);
  });

  it('never stores the base currency as a quote (no USD->USD self-rate)', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');

    await helpers.syncExchangeRates();

    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response.find((r) => r.quoteCode === 'USD')).toBeUndefined();
  });

  it('reports a Sentry event (logger.error) when the primary provider is unavailable', async () => {
    const errorSpy = jest.spyOn(logger, 'error');
    // 500 fails the health check too → primary is filtered out before the fetch loop,
    // the exact path that previously slipped through without an alert.
    currencyRatesApiOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(loggerErrorCalledWith(errorSpy, 'CURRENCY_RATES_API_FAILED')).toBe(true);
  });

  it('reports a Sentry event (logger.error) when a fallback provider is degraded', async () => {
    const errorSpy = jest.spyOn(logger, 'error');
    // Primary stays healthy; a lower-priority provider is down.
    frankfurterOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(loggerErrorCalledWith(errorSpy, 'Degraded sync')).toBe(true);
  });

  it('reports a Sentry event (logger.error) listing enabled currencies missing from the result', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');
    const errorSpy = jest.spyOn(logger, 'error');
    // Starve the comprehensive provider so the exotic long tail is uncovered.
    apiLayerOverride.setOverride({ body: { base: 'USD', date, success: true, timestamp: 1, rates: { EUR: 0.9 } } });

    await helpers.syncExchangeRates();

    const coverageCall = loggerErrorCalls(errorSpy).find(
      ([arg]) => typeof arg === 'string' && arg.includes('Enabled currencies missing'),
    );
    expect(coverageCall).toBeTruthy();
    // Starving the comprehensive provider leaves the whole exotic long tail
    // uncovered — far more than a healthy run would ever miss.
    const { missingCurrencies } = (coverageCall![1] ?? {}) as { missingCurrencies?: string[] };
    expect(Array.isArray(missingCurrencies)).toBe(true);
    expect(missingCurrencies!.length).toBeGreaterThan(50);
  });

  it('should successfully resolve when trying to sync data for the date with existing rates', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');

    await expect(helpers.getExchangeRates({ date, raw: true })).resolves.toBe(null);

    // First call to sync real data
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);
    // Second call should silently succeed (no error)
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);
  });

  it('should fallback to Frankfurter when Currency Rates API fails', async () => {
    // Simulate Currency Rates API failure
    currencyRatesApiOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const date = format(new Date(), 'yyyy-MM-dd');
    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);

    // Verify fallback occurred: Currency Rates API was unavailable, Frankfurter was used
    expect(currencyRatesApiCounter.count).toBeGreaterThanOrEqual(1);
    expect(frankfurterCounter.count).toBeGreaterThanOrEqual(1);
  });

  it('should use Currency Rates API successfully when available', async () => {
    // Currency Rates API should work and return success
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const date = format(new Date(), 'yyyy-MM-dd');
    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);

    // Verify Currency Rates API was called (isAvailable + fetchRatesForDate)
    // Note: Frankfurter's isAvailable() also makes an HTTP call, so its counter may be > 0
    expect(currencyRatesApiCounter.count).toBeGreaterThanOrEqual(2);
  });

  it('should fallback when Currency Rates API returns invalid base currency', async () => {
    currencyRatesApiOverride.setOneTimeOverride({
      body: {
        ...getCurrencyRatesApiResponseMock('2024-11-17'),
        base: 'EUR',
      },
    });
    // With the new system, if one provider returns invalid data, it falls back to the next
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);
  });

  it('should fallback to ApiLayer when Currency Rates API and Frankfurter return invalid data', async () => {
    // Make Currency Rates API fail
    currencyRatesApiOverride.setOverride({ status: 500 });
    // Make Frankfurter return invalid base currency
    frankfurterOverride.setOneTimeOverride({
      body: {
        ...getFrankfurterResponseMock('2024-11-17'),
        base: 'EUR',
      },
    });
    // With fallback system, it will try ApiLayer next
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);
  });

  it('should fallback through all providers when earlier ones fail', async () => {
    // Make Currency Rates API and Frankfurter fail
    currencyRatesApiOverride.setOverride({ status: 500 });
    frankfurterOverride.setOverride({ status: 500 });

    // ApiLayer should succeed as final fallback
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(200);

    // Verify full fallback chain: all providers were tried in order
    expect(currencyRatesApiCounter.count).toBeGreaterThanOrEqual(1);
    expect(frankfurterCounter.count).toBeGreaterThanOrEqual(1);
    expect(apiLayerCounter.count).toBeGreaterThanOrEqual(1);

    // The persisted rows must be attributed to the provider that actually won
    // the fallback chain (api-layer), not the ones that failed.
    const date = format(new Date(), 'yyyy-MM-dd');
    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response.length).toBeGreaterThan(0);
    response.forEach((item) => {
      expect(item.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER);
    });
  });

  it('should return 502 when all providers fail', async () => {
    currencyRatesApiOverride.setOverride({ status: 500 });
    frankfurterOverride.setOverride({ status: 500 });
    apiLayerOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });

  it('should handle ApiLayer 429 by trying next available key', async () => {
    // Make primary providers fail
    currencyRatesApiOverride.setOverride({ status: 500 });
    frankfurterOverride.setOverride({ status: 500 });

    // ApiLayer returns 429 for first key, should try next key
    apiLayerOverride.setOneTimeOverride({ status: 429 });
    // Since we have multiple API keys in tests, it should retry with next key
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(200);
  });

  it('should handle 500 Server Error from Currency Rates API by falling back', async () => {
    currencyRatesApiOverride.setOverride({ status: 500 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(200);
  });

  it('should handle 503 Service Unavailable from Currency Rates API by falling back', async () => {
    currencyRatesApiOverride.setOverride({ status: 503 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(200);
  });
});
