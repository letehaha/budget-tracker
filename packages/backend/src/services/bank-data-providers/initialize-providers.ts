import { logger } from '@js/utils/logger';

import { MonobankProvider } from './monobank';
import { bankProviderRegistry } from './registry';

/**
 * Initialize and register all bank data providers
 * Should be called at application startup
 */
export function initializeBankProviders(): void {
  try {
    // Register Monobank provider
    bankProviderRegistry.register(new MonobankProvider());

    // Future providers will be registered here:
    // bankProviderRegistry.register(new LunchFlowProvider());

    const registeredTypes = bankProviderRegistry.listTypes();
    logger.info(
      `[Bank Data Providers] Successfully initialized ${registeredTypes.length} provider(s): ${registeredTypes.join(', ')}`,
    );
  } catch (error) {
    logger.error({ message: '[Bank Data Providers] Failed to initialize providers:', error: error as Error });
    throw error;
  }
}
