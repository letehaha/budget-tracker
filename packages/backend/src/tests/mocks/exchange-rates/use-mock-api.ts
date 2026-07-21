import {
  API_LAYER_ENDPOINT_REGEX,
  CURRENCY_RATES_API_ENDPOINT_REGEX,
  FAWAZ_CURRENCY_API_ENDPOINT_REGEX,
} from '@tests/mocks/exchange-rates/endpoints';
import { HttpResponse, http } from 'msw';

import { getApiLayerResposeMock, getCurrencyRatesApiResponseMock, getFawazCurrencyApiResponseMock } from './data';

export const exchangeRatesHandlers = [
  // Currency Rates API handler (priority 1 - tried first)
  http.get(CURRENCY_RATES_API_ENDPOINT_REGEX, ({ request }) => {
    const url = request.url;

    // Health endpoint
    if (url.includes('/health')) {
      return HttpResponse.json({ status: 'ok', version: '0.1.0' });
    }

    // Check if it's a time series request (contains ..)
    const timeSeriesMatch = url.match(/(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/);
    if (timeSeriesMatch) {
      const startDate = timeSeriesMatch[1]!;
      const endDate = timeSeriesMatch[2]!;
      return HttpResponse.json({
        amount: 1,
        base: 'USD',
        start_date: startDate,
        end_date: endDate,
        rates: {
          [startDate]: getCurrencyRatesApiResponseMock(startDate).rates,
          [endDate]: getCurrencyRatesApiResponseMock(endDate).rates,
        },
      });
    }

    // Single date request
    const dateMatch = url.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      return HttpResponse.json(getCurrencyRatesApiResponseMock(dateMatch[0]));
    }

    // Latest rates
    if (url.includes('/latest')) {
      const today = new Date().toISOString().split('T')[0]!;
      return HttpResponse.json(getCurrencyRatesApiResponseMock(today));
    }

    return new HttpResponse(JSON.stringify({ error: 'Invalid date in URL' }), {
      status: 400,
    });
  }),
  // fawazahmed0 handler (priority 2 - free CDN, covers the exotic tail).
  // Required even though it's a default: the MSW server bypasses unhandled
  // requests, so without this tests would hit the real jsDelivr CDN. The date
  // sits in the path for jsDelivr (@YYYY-MM-DD) and in the subdomain for the
  // Cloudflare mirror (YYYY-MM-DD.currency-api.pages.dev) — one regex catches both.
  http.get(FAWAZ_CURRENCY_API_ENDPOINT_REGEX, ({ request }) => {
    const url = request.url;
    const dateMatch = url.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      return HttpResponse.json(getFawazCurrencyApiResponseMock(dateMatch[0]));
    }
    return new HttpResponse(JSON.stringify({ error: 'Invalid date in URL' }), {
      status: 400,
    });
  }),
  // ApiLayer handler (priority 3 - last-resort fallback)
  http.get(API_LAYER_ENDPOINT_REGEX, ({ request }) => {
    const url = request.url;
    const dateMatch = url.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      return HttpResponse.json(getApiLayerResposeMock(dateMatch[0]));
    }
    return new HttpResponse(JSON.stringify({ error: 'Invalid date in URL' }), {
      status: 400,
    });
  }),
];
