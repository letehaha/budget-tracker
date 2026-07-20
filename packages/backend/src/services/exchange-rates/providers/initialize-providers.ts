/**
 * Initialize exchange rate providers at application startup.
 *
 * Providers are registered in priority order:
 * 1. Currency Rates API (custom service) - Priority 1
 * 2. fawazahmed0 Currency API (free CDN) - Priority 2
 * 3. ApiLayer (comprehensive, paid) - Priority 3
 *
 * To disable a provider, simply comment out its registration line.
 */
import { logger } from '@js/utils';

import { ApiLayerProvider } from './api-layer';
import { CurrencyRatesApiProvider } from './currency-rates-api';
import { FawazCurrencyApiProvider } from './fawaz-currency-api';
import { exchangeRateProviderRegistry } from './registry';

/**
 * Initialize and register all exchange rate providers
 */
export function initializeExchangeRateProviders(): void {
  logger.info('Initializing exchange rate providers...');

  // Register providers in priority order
  // Priority 1: Custom Currency Rates API (try first)
  exchangeRateProviderRegistry.register(new CurrencyRatesApiProvider());

  // Priority 2: fawazahmed0 Currency API (free CDN, fills the exotic long tail on fresh dates)
  exchangeRateProviderRegistry.register(new FawazCurrencyApiProvider());

  // Priority 3: ApiLayer (comprehensive, paid last-resort fallback)
  exchangeRateProviderRegistry.register(new ApiLayerProvider());

  logger.info(`Initialized ${exchangeRateProviderRegistry.getCount()} exchange rate providers`);
}
