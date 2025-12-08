/**
 * Initialize exchange rate providers at application startup.
 *
 * Providers are registered in priority order:
 * 1. Currency Rates API (custom service) - Priority 1
 * 2. Frankfurter (free ECB data) - Priority 2
 * 3. ApiLayer (comprehensive, paid) - Priority 3
 *
 * To disable a provider, simply comment out its registration line.
 */
import { logger } from '@js/utils';

import { ApiLayerProvider } from './api-layer';
import { CurrencyRatesApiProvider } from './currency-rates-api';
import { FrankfurterProvider } from './frankfurter';
import { exchangeRateProviderRegistry } from './registry';

/**
 * Initialize and register all exchange rate providers
 */
export function initializeExchangeRateProviders(): void {
  logger.info('Initializing exchange rate providers...');

  // Register providers in priority order
  // Priority 1: Custom Currency Rates API (try first)
  exchangeRateProviderRegistry.register(new CurrencyRatesApiProvider());

  // Priority 2: Frankfurter (free fallback)
  exchangeRateProviderRegistry.register(new FrankfurterProvider());

  // Priority 3: ApiLayer (comprehensive, paid fallback)
  exchangeRateProviderRegistry.register(new ApiLayerProvider());

  logger.info(`Initialized ${exchangeRateProviderRegistry.getCount()} exchange rate providers`);
}
