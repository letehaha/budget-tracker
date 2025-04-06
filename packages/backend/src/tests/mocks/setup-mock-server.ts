import { setupServer } from 'msw/node';

import { exchangeRatesHandlers } from './exchange-rates/use-mock-api';
import { monobankHandlers } from './monobank/mock-api';

export const setupMswServer = () => setupServer(...exchangeRatesHandlers, ...monobankHandlers);
