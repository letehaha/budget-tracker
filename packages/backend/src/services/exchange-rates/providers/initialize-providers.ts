/**
 * Initialize exchange rate providers at application startup.
 *
 * Providers are registered in priority order:
 * 1. Currency Rates API (custom service) - Priority 1
 * 2. ApiLayer (comprehensive, paid) - Priority 2
 *
 * To disable a provider, simply comment out its registration line.
 */
import { logger } from '@js/utils';

import { ApiLayerProvider } from './api-layer';
import { CurrencyRatesApiProvider } from './currency-rates-api';
import { exchangeRateProviderRegistry } from './registry';

/**
 * Initialize and register all exchange rate providers
 */
export function initializeExchangeRateProviders(): void {
  logger.info('Initializing exchange rate providers...');

  // Register providers in priority order
  // Priority 1: Custom Currency Rates API (try first)
  exchangeRateProviderRegistry.register(new CurrencyRatesApiProvider());

  // Priority 2: ApiLayer (comprehensive, paid fallback for the exotic long tail)
  exchangeRateProviderRegistry.register(new ApiLayerProvider());

  logger.info(`Initialized ${exchangeRateProviderRegistry.getCount()} exchange rate providers`);
}
