import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '@js/utils';
import { connection } from '@models/index';
import * as helpers from '@tests/helpers';
import { getApiLayerResposeMock, getCurrencyRatesApiResponseMock } from '@tests/mocks/exchange-rates/data';
import { API_LAYER_ENDPOINT_REGEX, CURRENCY_RATES_API_ENDPOINT_REGEX } from '@tests/mocks/exchange-rates/endpoints';
import { createCallsCounter, createOverride } from '@tests/mocks/helpers';
import { format, startOfDay } from 'date-fns';

import { EXCHANGE_RATE_PROVIDER_TYPE } from './providers/types';

// logger.error is an overloaded fn, so jest infers its call args as `never`.
// Read the recorded calls through a widened tuple type for assertions.
const loggerErrorCalls = (errorSpy: ReturnType<typeof jest.spyOn>): Array<[unknown, Record<string, unknown>?]> =>
  errorSpy.mock.calls as unknown as Array<[unknown, Record<string, unknown>?]>;

// Returns true if logger.error was called with a message containing `substring`.
const loggerErrorCalledWith = (errorSpy: ReturnType<typeof jest.spyOn>, substring: string): boolean =>
  loggerErrorCalls(errorSpy).some(([arg]) => typeof arg === 'string' && arg.includes(substring));

describe('Exchange Rates Functionality', () => {
  let currencyRatesApiOverride: ReturnType<typeof createOverride>;
  let apiLayerOverride: ReturnType<typeof createOverride>;

  let currencyRatesApiCounter: ReturnType<typeof createCallsCounter>;
  let apiLayerCounter: ReturnType<typeof createCallsCounter>;

  beforeAll(() => {
    currencyRatesApiOverride = createOverride(global.mswMockServer, CURRENCY_RATES_API_ENDPOINT_REGEX);
    apiLayerOverride = createOverride(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);

    currencyRatesApiCounter = createCallsCounter(global.mswMockServer, CURRENCY_RATES_API_ENDPOINT_REGEX);
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
    apiLayerCounter.reset();
    // Drop any logger spies installed by degradation-signal tests
    jest.restoreAllMocks();
  });

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
      // `source` must be populated with a real provider – guards against
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
    // providers – filling gaps left by higher-priority ones – instead of
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

    // ApiLayer (priority 2) returns a DIFFERENT EUR value. The primary must win on
    // the VALUE, not just the source label – guards the dedup precedence path.
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
    // Primary stays healthy; the comprehensive fallback fails its health check
    // (500), so it is skipped by isAvailable(). The exotic long tail is then
    // uncovered – surfaced as a degraded-sync alert independent of the
    // primary-degraded path.
    apiLayerOverride.setOverride({ status: 500 });

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
    // uncovered – far more than a healthy run would ever miss.
    const { missingCurrencies } = (coverageCall![1] ?? {}) as { missingCurrencies?: string[] };
    expect(Array.isArray(missingCurrencies)).toBe(true);
    expect(missingCurrencies!.length).toBeGreaterThan(50);
  });

  it('skips the provider fetch on a re-sync once ApiLayer has covered the date', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');

    await expect(helpers.getExchangeRates({ date, raw: true })).resolves.toBe(null);

    // First sync populates the date, including ApiLayer-sourced rows.
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    // Confirm ApiLayer actually contributed – otherwise the gate below is vacuous.
    const seeded = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(seeded.some((r) => r.source === EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER)).toBe(true);

    // The comprehensiveness gate keys off an ApiLayer-sourced row existing for the
    // date, so a second sync must short-circuit BEFORE hitting any provider.
    currencyRatesApiCounter.reset();
    apiLayerCounter.reset();

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(currencyRatesApiCounter.count).toBe(0);
    expect(apiLayerCounter.count).toBe(0);
  });

  it('re-fetches a date that has rates but none sourced from ApiLayer', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');
    const today = startOfDay(new Date());

    // Seed a NON-comprehensive date: one Currency Rates API-sourced row, no
    // ApiLayer. Mirrors a historical-init date (only the ECB-based provider ran),
    // where an on-demand lookup should still reach ApiLayer for the exotic tail.
    await connection.sequelize.query(
      `INSERT INTO "ExchangeRates" ("baseCode", "quoteCode", "date", "rate", "source")
       VALUES ('USD', 'EUR', :today, 0.9, :source)`,
      { replacements: { today, source: EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API } },
    );

    currencyRatesApiCounter.reset();
    apiLayerCounter.reset();

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    // No ApiLayer-sourced row exists → the gate must NOT skip; providers run.
    expect(currencyRatesApiCounter.count).toBeGreaterThanOrEqual(1);

    // And ApiLayer now contributes, making the date comprehensive going forward.
    const after = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(after.some((r) => r.source === EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER)).toBe(true);
  });

  it('re-fetches a date where ApiLayer returned nothing (no api-layer row was written)', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');

    // ApiLayer down but the primary succeeds: the date gets rows, yet NONE are
    // api-layer-sourced. The comprehensiveness gate keys off an api-layer row
    // existing, so a date ApiLayer skipped (down / rate-limited / no key) must
    // NOT be treated as covered – the next sync has to run again.
    apiLayerOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const seeded = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.some((r) => r.source === EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER)).toBe(false);

    currencyRatesApiCounter.reset();
    apiLayerCounter.reset();

    // No api-layer row → gate is not comprehensive → providers must run again
    // (the opposite of the "ApiLayer already covered the date" skip above).
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(currencyRatesApiCounter.count).toBeGreaterThanOrEqual(1);
  });

  it('should fallback to ApiLayer when Currency Rates API fails', async () => {
    // Simulate Currency Rates API failure
    currencyRatesApiOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const date = format(new Date(), 'yyyy-MM-dd');
    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);

    // Verify fallback occurred: Currency Rates API was unavailable, ApiLayer was used.
    expect(currencyRatesApiCounter.count).toBeGreaterThanOrEqual(1);
    expect(apiLayerCounter.count).toBeGreaterThanOrEqual(1);
    response.forEach((item) => {
      expect(item.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER);
    });
  });

  it('should use Currency Rates API successfully when available', async () => {
    // Currency Rates API should work and return success
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const date = format(new Date(), 'yyyy-MM-dd');
    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);

    // Verify Currency Rates API was called (isAvailable + fetchRatesForDate).
    expect(currencyRatesApiCounter.count).toBeGreaterThanOrEqual(2);
  });

  it('should fallback to ApiLayer when Currency Rates API returns an invalid base currency', async () => {
    currencyRatesApiOverride.setOneTimeOverride({
      body: {
        ...getCurrencyRatesApiResponseMock('2024-11-17'),
        base: 'EUR',
      },
    });
    // With the merging registry, an invalid response from a provider drops it
    // from contribution and the chain continues to the next one.
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);
  });

  it('should return 502 when all providers fail', async () => {
    currencyRatesApiOverride.setOverride({ status: 500 });
    apiLayerOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });

  it('should handle ApiLayer 429 by trying next available key', async () => {
    // Make primary provider fail so the chain reaches ApiLayer.
    currencyRatesApiOverride.setOverride({ status: 500 });

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
