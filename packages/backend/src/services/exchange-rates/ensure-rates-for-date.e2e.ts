import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '@js/utils';
import { connection } from '@models/index';
import * as helpers from '@tests/helpers';
import { getCurrencyRatesApiResponseMock, getFawazCurrencyApiResponseMock } from '@tests/mocks/exchange-rates/data';
import {
  API_LAYER_ENDPOINT_REGEX,
  CURRENCY_RATES_API_ENDPOINT_REGEX,
  FAWAZ_CURRENCY_API_ENDPOINT_REGEX,
} from '@tests/mocks/exchange-rates/endpoints';
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
  let fawazOverride: ReturnType<typeof createOverride>;
  let apiLayerOverride: ReturnType<typeof createOverride>;

  let currencyRatesApiCounter: ReturnType<typeof createCallsCounter>;
  let fawazCounter: ReturnType<typeof createCallsCounter>;
  let apiLayerCounter: ReturnType<typeof createCallsCounter>;

  beforeAll(() => {
    currencyRatesApiOverride = createOverride(global.mswMockServer, CURRENCY_RATES_API_ENDPOINT_REGEX);
    fawazOverride = createOverride(global.mswMockServer, FAWAZ_CURRENCY_API_ENDPOINT_REGEX);
    apiLayerOverride = createOverride(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);

    currencyRatesApiCounter = createCallsCounter(global.mswMockServer, CURRENCY_RATES_API_ENDPOINT_REGEX);
    fawazCounter = createCallsCounter(global.mswMockServer, FAWAZ_CURRENCY_API_ENDPOINT_REGEX);
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
    fawazCounter.reset();
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
    // Currency Rates API (priority 1) only covers ~38 currencies but succeeds
    // every day, so the chain must MERGE lower-priority providers to fill the
    // gaps instead of returning on first success. fawazahmed0 (priority 2) now
    // covers the exotic long tail (ETB, HNL, PEN, RSD, TZS, XAF), so those
    // currencies come from it – and because it covers everything the enabled set
    // needs, ApiLayer (priority 3) is never reached.
    const date = format(new Date(), 'yyyy-MM-dd');

    // All providers available with their default mocks (no overrides).
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    const byQuote = new Map(response.map((row) => [row.quoteCode, row]));

    // Absent from Currency Rates API's mock → filled by fawazahmed0's tail.
    for (const exotic of ['ETB', 'HNL', 'PEN', 'RSD', 'TZS', 'XAF']) {
      const row = byQuote.get(exotic);
      expect(row).toBeTruthy();
      expect(row!.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.FAWAZ_CURRENCY_API);
    }

    // Currencies the primary provider covers must keep its (higher-priority) source.
    expect(byQuote.get('EUR')?.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API);
    expect(byQuote.get('UAH')?.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API);
  });

  it('keeps the higher-priority provider value when two providers supply the same currency', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');
    const primaryEur = getCurrencyRatesApiResponseMock(date).rates.EUR;

    // fawazahmed0 (priority 2) returns a DIFFERENT EUR value. The primary must win
    // on the VALUE, not just the source label – guards the dedup precedence path.
    // ApiLayer stays skipped here because fawazahmed0 already covers the enabled set.
    const fawazMock = getFawazCurrencyApiResponseMock(date);
    fawazOverride.setOverride({ body: { ...fawazMock, usd: { ...fawazMock.usd, eur: 0.123456 } } });

    await helpers.syncExchangeRates();

    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    const eur = response.find((r) => r.quoteCode === 'EUR')!;
    expect(eur.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API);
    expect(eur.rate).toBeCloseTo(primaryEur, 6);
  });

  it('early-stop skips ApiLayer when free providers cover every enabled currency', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');

    // The default mock basket lacks SSP and STN, so the enabled set is never fully
    // covered and ApiLayer would still be queried. Extend fawazahmed0 with both →
    // full coverage after priority 2, so the paid ApiLayer call must be skipped.
    const fawazMock = getFawazCurrencyApiResponseMock(date);
    fawazOverride.setOverride({ body: { ...fawazMock, usd: { ...fawazMock.usd, ssp: 130.26, stn: 22.72 } } });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(apiLayerCounter.count).toBe(0);

    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response.some((r) => r.source === EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER)).toBe(false);
    // The extended tail actually landed – proves coverage came from fawazahmed0.
    expect(response.find((r) => r.quoteCode === 'SSP')?.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.FAWAZ_CURRENCY_API);
  });

  it('gap alert fires when ApiLayer fills a currency fawazahmed0 lacks', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');
    const errorSpy = jest.spyOn(logger, 'error');

    // fawazahmed0 succeeds but its basket lacks ETB (a currency the primary never
    // supplies), so only the paid ApiLayer can fill it. A post-2024 date where
    // fawazahmed0 ran yet left a hole is a data anomaly the alert must surface.
    const fawazMock = getFawazCurrencyApiResponseMock(date);
    const usd = { ...fawazMock.usd };
    delete usd.etb;
    fawazOverride.setOverride({ body: { ...fawazMock, usd } });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(loggerErrorCalledWith(errorSpy, '[ALERT:FAWAZ_CURRENCY_API_GAP]')).toBe(true);

    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response.find((r) => r.quoteCode === 'ETB')?.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER);
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
    // Primary stays healthy; the comprehensive fallback (fawazahmed0) fails, so
    // its fetch yields nothing and the exotic long tail lands in `failed` –
    // surfaced as a degraded-sync alert independent of the primary-degraded path.
    // Degrading ApiLayer alone would do nothing now: it is skipped whenever
    // fawazahmed0 covers the enabled set, so fawazahmed0 is what must go down.
    fawazOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(loggerErrorCalledWith(errorSpy, 'Degraded sync')).toBe(true);
  });

  it('reports a Sentry event (logger.error) listing enabled currencies missing from the result', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');
    const errorSpy = jest.spyOn(logger, 'error');
    // Starve BOTH fallbacks so the exotic long tail is uncovered: fawazahmed0 down,
    // ApiLayer trimmed to a single currency. Only the primary's ~38 currencies land.
    fawazOverride.setOverride({ status: 500 });
    apiLayerOverride.setOverride({ body: { base: 'USD', date, success: true, timestamp: 1, rates: { EUR: 0.9 } } });

    await helpers.syncExchangeRates();

    const coverageCall = loggerErrorCalls(errorSpy).find(
      ([arg]) => typeof arg === 'string' && arg.includes('Enabled currencies missing'),
    );
    expect(coverageCall).toBeTruthy();
    // Starving both fallbacks leaves the whole exotic long tail uncovered –
    // far more than a healthy run would ever miss.
    const { missingCurrencies } = (coverageCall![1] ?? {}) as { missingCurrencies?: string[] };
    expect(Array.isArray(missingCurrencies)).toBe(true);
    expect(missingCurrencies!.length).toBeGreaterThan(50);
  });

  it('skips the provider fetch on a re-sync once a comprehensive provider has covered the date', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');

    await expect(helpers.getExchangeRates({ date, raw: true })).resolves.toBe(null);

    // First sync: currency-rates-api + fawazahmed0 populate the date. fawazahmed0 is
    // a whole-basket provider, so its rows mark the date comprehensively fetched,
    // and it fills the exotic tail — leaving ApiLayer nothing to add.
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const seeded = (await helpers.getExchangeRates({ date, raw: true }))!;
    // fawazahmed0 ran (its rows exist) → the comprehensiveness gate is satisfied,
    // and ApiLayer contributed nothing, so no paid-provider row was written.
    expect(seeded.some((r) => r.source === EXCHANGE_RATE_PROVIDER_TYPE.FAWAZ_CURRENCY_API)).toBe(true);
    expect(seeded.some((r) => r.source === EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER)).toBe(false);

    // The comprehensiveness gate (a whole-basket provider ran) must short-circuit
    // the second sync BEFORE hitting any provider.
    currencyRatesApiCounter.reset();
    fawazCounter.reset();
    apiLayerCounter.reset();

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(currencyRatesApiCounter.count).toBe(0);
    expect(fawazCounter.count).toBe(0);
    expect(apiLayerCounter.count).toBe(0);
  });

  it('re-fetches a date whose rows come from no whole-basket provider', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');
    const today = startOfDay(new Date());

    // Seed a NON-comprehensive date: one Currency Rates API-sourced row, nothing
    // else. No whole-basket provider (fawazahmed0 / api-layer) has a row for the
    // date, so the gate is false and the sync must still run the providers to fill
    // the tail.
    await connection.sequelize.query(
      `INSERT INTO "ExchangeRates" ("baseCode", "quoteCode", "date", "rate", "source")
       VALUES ('USD', 'EUR', :today, 0.9, :source)`,
      { replacements: { today, source: EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API } },
    );

    currencyRatesApiCounter.reset();
    fawazCounter.reset();
    apiLayerCounter.reset();

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    // Gate is not comprehensive → the gate must NOT skip; providers run.
    expect(currencyRatesApiCounter.count).toBeGreaterThanOrEqual(1);

    // fawazahmed0 now fills the exotic tail that Currency Rates API leaves out.
    const after = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(after.some((r) => r.source === EXCHANGE_RATE_PROVIDER_TYPE.FAWAZ_CURRENCY_API)).toBe(true);
  });

  it('re-fetches a date where ApiLayer returned nothing (no api-layer row was written)', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');

    // Both fallbacks down: only Currency Rates API succeeds (its ~38 currencies), so
    // no whole-basket provider (fawazahmed0 / api-layer) wrote a row. Neither
    // comprehensiveness signal holds, so a date the fallbacks skipped (down /
    // rate-limited / no key) must NOT be treated as covered – the next sync re-runs.
    fawazOverride.setOverride({ status: 500 });
    apiLayerOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const seeded = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.some((r) => r.source === EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER)).toBe(false);

    currencyRatesApiCounter.reset();
    fawazCounter.reset();
    apiLayerCounter.reset();

    // Neither fully covered nor api-layer-marked → gate stays non-comprehensive →
    // providers must run again (the opposite of the "date fully covered" skip above).
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(currencyRatesApiCounter.count).toBeGreaterThanOrEqual(1);
  });

  it('skips the re-sync when only api-layer rows mark the date comprehensively fetched', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');

    // fawazahmed0 down for the first sync → ApiLayer fills the exotic tail, so the
    // only whole-basket rows for the date are api-layer-sourced. Those alone must
    // satisfy the comprehensiveness gate: an outage day must not cause re-fetch loops.
    fawazOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const seeded = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(seeded.some((r) => r.source === EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER)).toBe(true);
    expect(seeded.some((r) => r.source === EXCHANGE_RATE_PROVIDER_TYPE.FAWAZ_CURRENCY_API)).toBe(false);

    // fawazahmed0 recovers, but the gate must short-circuit before any provider call.
    global.mswMockServer.resetHandlers();
    currencyRatesApiCounter.reset();
    fawazCounter.reset();
    apiLayerCounter.reset();

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(currencyRatesApiCounter.count).toBe(0);
    expect(fawazCounter.count).toBe(0);
    expect(apiLayerCounter.count).toBe(0);
  });

  it('falls back to fawazahmed0 when Currency Rates API fails', async () => {
    // Simulate Currency Rates API failure
    currencyRatesApiOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const date = format(new Date(), 'yyyy-MM-dd');
    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);

    // Primary down → fawazahmed0 (priority 2) supplies every stored rate, so the
    // paid ApiLayer (priority 3) contributes nothing and no api-layer-sourced row
    // is written. ApiLayer is still queried here: a permanently-unpriceable
    // enabled currency (e.g. SSP, absent from every mock) keeps the coverage
    // check from short-circuiting. In production, where fawazahmed0 covers the
    // full enabled set, the paid call is skipped entirely.
    expect(currencyRatesApiCounter.count).toBeGreaterThanOrEqual(1);
    expect(fawazCounter.count).toBeGreaterThanOrEqual(1);
    expect(response.some((item) => item.source === EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER)).toBe(false);
    response.forEach((item) => {
      expect(item.source).toBe(EXCHANGE_RATE_PROVIDER_TYPE.FAWAZ_CURRENCY_API);
    });
  });

  it('falls back to ApiLayer when both Currency Rates API and fawazahmed0 fail', async () => {
    // Both free providers down → the chain must reach the paid last-resort.
    currencyRatesApiOverride.setOverride({ status: 500 });
    fawazOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const date = format(new Date(), 'yyyy-MM-dd');
    const response = (await helpers.getExchangeRates({ date, raw: true }))!;
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);

    // ApiLayer (priority 3) is the only provider left to cover the date.
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

  it('falls back to fawazahmed0 when Currency Rates API returns an invalid base currency', async () => {
    currencyRatesApiOverride.setOneTimeOverride({
      body: {
        ...getCurrencyRatesApiResponseMock('2024-11-17'),
        base: 'EUR',
      },
    });
    // With the merging registry, an invalid response from a provider drops it
    // from contribution and the chain continues – fawazahmed0 then fills the set.
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);
  });

  it('should return 502 when all providers fail', async () => {
    currencyRatesApiOverride.setOverride({ status: 500 });
    fawazOverride.setOverride({ status: 500 });
    apiLayerOverride.setOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });

  it('should handle ApiLayer 429 by trying next available key', async () => {
    // Make both free providers fail so the chain reaches ApiLayer.
    currencyRatesApiOverride.setOverride({ status: 500 });
    fawazOverride.setOverride({ status: 500 });

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
