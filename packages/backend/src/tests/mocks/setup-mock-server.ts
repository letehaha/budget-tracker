import { setupServer } from 'msw/node';

import { enableBankingHandlers } from './enablebanking/mock-api';
import { exchangeRatesHandlers } from './exchange-rates/use-mock-api';
import { lunchflowHandlers } from './lunchflow/mock-api';
import { monobankHandlers } from './monobank/mock-api';

export const setupMswServer = () =>
  setupServer(...exchangeRatesHandlers, ...monobankHandlers, ...lunchflowHandlers, ...enableBankingHandlers);
