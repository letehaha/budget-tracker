import { beforeAll, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { getApiLayerResposeMock } from '@tests/mocks/exchange-rates/data';
import { createCallsCounter, createOverride } from '@tests/mocks/helpers';
import { format } from 'date-fns';

import { API_LAYER_ENDPOINT_REGEX } from './fetch-exchange-rates-for-date';

describe('Exchange Rates Functionality', () => {
  let apiOverride: ReturnType<typeof createOverride>;

  beforeAll(() => {
    apiOverride = createOverride(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);
  });

  it('should successfully fetch and store exchange rates', async () => {
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

    const counter = createCallsCounter(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);

    await expect(helpers.getExchangeRates({ date, raw: true })).resolves.toBe(null);

    // First call to sync real data
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);
    // Second call should silently succeed with no external being API called
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(200);

    expect(counter.count).toBe(1);
  });

  it('should return validation error if API returns something not related to base currency', async () => {
    apiOverride.setOneTimeOverride({
      body: {
        ...getApiLayerResposeMock('2024-11-17'),
        base: 'EUR',
      },
    });
    await expect(helpers.syncExchangeRates().then((r) => r.statusCode)).resolves.toEqual(422);
  });

  it('should handle 400 Bad Request error', async () => {
    apiOverride.setOneTimeOverride({ status: 400 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });

  it('should handle 401 Unauthorized error', async () => {
    apiOverride.setOneTimeOverride({ status: 401 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });

  it('should handle 404 Not Found error', async () => {
    apiOverride.setOneTimeOverride({ status: 404 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });

  it('should handle 429 Too Many Requests error', async () => {
    apiOverride.setOneTimeOverride({ status: 429 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(429);
  });

  it('should handle 500 Server Error', async () => {
    apiOverride.setOneTimeOverride({ status: 500 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });

  it('should handle 5xx Error', async () => {
    apiOverride.setOneTimeOverride({ status: 503 });
    await expect(helpers.syncExchangeRates().then((m) => m.statusCode)).resolves.toBe(502);
  });
});
