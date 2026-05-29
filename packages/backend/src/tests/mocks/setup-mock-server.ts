import { http, passthrough } from 'msw';
import { setupServer } from 'msw/node';

import { anthropicHandlers } from './anthropic/mock-api';
import { enableBankingHandlers } from './enablebanking/mock-api';
import { exchangeRatesHandlers } from './exchange-rates/use-mock-api';
import { lunchflowHandlers } from './lunchflow/mock-api';
import { monobankHandlers } from './monobank/mock-api';
import { walutomatHandlers } from './walutomat/mock-api';

// Passthrough handler for local supertest requests — prevents MSW from
// intercepting requests to the in-process Express server
const localhostPassthrough = http.all(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//, () => {
  return passthrough();
});

export const setupMswServer = () =>
  setupServer(
    localhostPassthrough,
    ...exchangeRatesHandlers,
    ...monobankHandlers,
    ...enableBankingHandlers,
    ...lunchflowHandlers,
    ...walutomatHandlers,
    ...anthropicHandlers,
  );
