import { API_LAYER_ENDPOINT_REGEX } from '@services/exchange-rates/fetch-exchange-rates-for-date';
import { HttpResponse, http } from 'msw';

import { getApiLayerResposeMock } from './data';

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
];
