import { beforeAll, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { getApiLayerResposeMock, getFrankfurterResponseMock } from '@tests/mocks/exchange-rates/data';
import { createCallsCounter, createOverride } from '@tests/mocks/helpers';
import { format } from 'date-fns';

import { API_LAYER_ENDPOINT_REGEX, FRANKFURTER_ENDPOINT_REGEX } from './fetch-exchange-rates-for-date';

describe('Exchange Rates Functionality', () => {
  let apiLayerOverride: ReturnType<typeof createOverride>;
  let frankfurterOverride: ReturnType<typeof createOverride>;

  beforeAll(() => {
    apiLayerOverride = createOverride(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);
    frankfurterOverride = createOverride(global.mswMockServer, FRANKFURTER_ENDPOINT_REGEX);
  });

  it('should successfully fetch and store exchange rates using hybrid approach (ApiLayer + Frankfurter)', async () => {
    const date = format(new Date(), 'yyyy-MM-dd');

    await expect(helpers.getExchangeRates({ date, raw: true })).resolves.toBe(null);
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    const response = await helpers.getExchangeRates({ date, raw: true });
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);

    response.forEach((item) => {
      expect(item).toMatchObject({
        date: expect.stringContaining(date),
      });
    });
  });

  it('should successfully resolve when trying to sync data for the date with existing rates. No external API call should happen', async () => {
    // Imitate today's date, because `sync` actually happens only for today
    const date = format(new Date(), 'yyyy-MM-dd');

    const frankfurterCounter = createCallsCounter(global.mswMockServer, FRANKFURTER_ENDPOINT_REGEX);
    const apiLayerCounter = createCallsCounter(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);

    await expect(helpers.getExchangeRates({ date, raw: true })).resolves.toBe(null);

    // First call to sync real data
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);
    // Second call should silently succeed with no external being API called
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    // Only one call to ApiLayer should happen (Frankfurt not called when ApiLayer succeeds)
    expect(frankfurterCounter.count).toBe(0);
    expect(apiLayerCounter.count).toBe(1);
  });

  it('should fallback to Frankfurter when ApiLayer fails', async () => {
    const frankfurterCounter = createCallsCounter(global.mswMockServer, FRANKFURTER_ENDPOINT_REGEX);
    const apiLayerCounter = createCallsCounter(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);

    // Simulate ApiLayer failure (server error triggers fallback)
    apiLayerOverride.setOneTimeOverride({ status: 500 });

    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    // Should attempt ApiLayer once and fallback to Frankfurter once
    expect(apiLayerCounter.count).toBe(1);
    expect(frankfurterCounter.count).toBe(1);

    const date = format(new Date(), 'yyyy-MM-dd');
    const response = await helpers.getExchangeRates({ date, raw: true });
    expect(response).toBeInstanceOf(Array);
    expect(response.length).toBeGreaterThan(0);
  });

  it('should use only ApiLayer when it succeeds', async () => {
    const frankfurterCounter = createCallsCounter(global.mswMockServer, FRANKFURTER_ENDPOINT_REGEX);
    const apiLayerCounter = createCallsCounter(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);

    // ApiLayer should be called first and succeed
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    // Only ApiLayer should be called (Frankfurter not needed when ApiLayer succeeds)
    expect(apiLayerCounter.count).toBe(1);
    expect(frankfurterCounter.count).toBe(0);
  });

  it('should return validation error if ApiLayer returns something not related to base currency', async () => {
    apiLayerOverride.setOneTimeOverride({
      body: {
        ...getApiLayerResposeMock('2024-11-17'),
        base: 'EUR',
      },
    });
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(422);
  });

  it('should return validation error if Frankfurter returns something not related to base currency when used as fallback', async () => {
    // First make ApiLayer fail to trigger Frankfurter fallback
    apiLayerOverride.setOneTimeOverride({ status: 500 });
    // Then make Frankfurter return invalid base currency
    frankfurterOverride.setOneTimeOverride({
      body: {
        ...getFrankfurterResponseMock('2024-11-17'),
        base: 'EUR',
      },
    });
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(422);
  });

  it('should handle 400 Bad Request error from ApiLayer', async () => {
    apiLayerOverride.setOneTimeOverride({ status: 400 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });

  it('should handle 401 Unauthorized error from ApiLayer', async () => {
    apiLayerOverride.setOneTimeOverride({ status: 401 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });

  it('should handle 404 Not Found error from ApiLayer', async () => {
    apiLayerOverride.setOneTimeOverride({ status: 404 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });

  it('should handle 429 Too Many Requests error for one of ApiLayer keys', async () => {
    // Use one-time override to simulate 429 for first call, and 200 for the next one
    apiLayerOverride.setOneTimeOverride({ status: 429 });
    // Since retry happens inside the request, it means that we need to check exactly for
    // status code 200, because 429 won't ever be exposed
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(200);
  });

  it('should handle 429 Too Many Requests error from ApiLayer by falling back to Frankfurter', async () => {
    // Use full override to ensure all API key retries return 429
    // This tests the scenario where all API keys are exhausted due to rate limiting
    apiLayerOverride.setOverride({ status: 429 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(200);
  });

  it('should handle 500 Server Error from ApiLayer by falling back to Frankfurter', async () => {
    apiLayerOverride.setOneTimeOverride({ status: 500 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(200);
  });

  it('should handle 5xx Error from ApiLayer by falling back to Frankfurter', async () => {
    apiLayerOverride.setOneTimeOverride({ status: 503 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(200);
  });
});
