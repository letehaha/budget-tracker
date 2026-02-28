import { setupServer } from 'msw/node';

import { anthropicHandlers } from './anthropic/mock-api';
import { enableBankingHandlers } from './enablebanking/mock-api';
import { exchangeRatesHandlers } from './exchange-rates/use-mock-api';
import { lunchflowHandlers } from './lunchflow/mock-api';
import { monobankHandlers } from './monobank/mock-api';
import { walutomatHandlers } from './walutomat/mock-api';

export const setupMswServer = () =>
  setupServer(
    ...exchangeRatesHandlers,
    ...monobankHandlers,
    ...enableBankingHandlers,
    ...lunchflowHandlers,
    ...walutomatHandlers,
    ...anthropicHandlers,
  );
