import {
  API_LAYER_ENDPOINT_REGEX,
  FRANKFURTER_ENDPOINT_REGEX,
} from '@services/exchange-rates/fetch-exchange-rates-for-date';
import { HttpResponse, http } from 'msw';

import { getApiLayerResposeMock, getFrankfurterResponseMock } from './data';

export const exchangeRatesHandlers = [
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
  http.get(FRANKFURTER_ENDPOINT_REGEX, ({ request }) => {
    const url = request.url;

    // Check if it's a time series request (contains ..)
    const timeSeriesMatch = url.match(/(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/);
    if (timeSeriesMatch) {
      const startDate = timeSeriesMatch[1]!;
      const endDate = timeSeriesMatch[2]!;
      // Return a minimal time series response with just a few dates
      return HttpResponse.json({
        amount: 1,
        base: 'USD',
        start_date: startDate,
        end_date: endDate,
        rates: {
          [startDate]: getFrankfurterResponseMock(startDate).rates,
          [endDate]: getFrankfurterResponseMock(endDate).rates,
        },
      });
    }

    // Single date request
    const dateMatch = url.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      return HttpResponse.json(getFrankfurterResponseMock(dateMatch[0]));
    }

    return new HttpResponse(JSON.stringify({ error: 'Invalid date in URL' }), {
      status: 400,
    });
  }),
];
