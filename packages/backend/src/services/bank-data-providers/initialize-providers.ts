import { logger } from '@js/utils/logger';

import { EnableBankingProvider } from './enablebanking';
import { LunchFlowProvider } from './lunchflow/lunchflow.provider';
import { MonobankProvider } from './monobank';
import { bankProviderRegistry } from './registry';
import { WalutomatProvider } from './walutomat';

/**
 * Initialize and register all bank data providers
 * Should be called at application startup
 */
export function initializeBankProviders(): void {
  try {
    // Register Monobank provider
    bankProviderRegistry.register(new MonobankProvider());

    // Register Enable Banking provider
    bankProviderRegistry.register(new EnableBankingProvider());

    // Register LunchFlow provider
    bankProviderRegistry.register(new LunchFlowProvider());

    // Register Walutomat provider
    bankProviderRegistry.register(new WalutomatProvider());

    const registeredTypes = bankProviderRegistry.listTypes();
    logger.info(
      `[Bank Data Providers] Successfully initialized ${registeredTypes.length} provider(s): ${registeredTypes.join(', ')}`,
    );
  } catch (error) {
    logger.error({ message: '[Bank Data Providers] Failed to initialize providers:', error: error as Error });
    throw error;
  }
}
