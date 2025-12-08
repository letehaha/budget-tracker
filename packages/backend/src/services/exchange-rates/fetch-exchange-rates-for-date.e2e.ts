import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { getCurrencyRatesApiResponseMock, getFrankfurterResponseMock } from '@tests/mocks/exchange-rates/data';
import { createCallsCounter, createOverride } from '@tests/mocks/helpers';
import { format } from 'date-fns';

import {
  API_LAYER_ENDPOINT_REGEX,
  CURRENCY_RATES_API_ENDPOINT_REGEX,
  FRANKFURTER_ENDPOINT_REGEX,
} from './fetch-exchange-rates-for-date';

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

  afterEach(() => {
    // Reset handlers to defaults after each test
    global.mswMockServer.resetHandlers();
    // Reset call counters
    currencyRatesApiCounter.reset();
    frankfurterCounter.reset();
    apiLayerCounter.reset();
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
    });
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
