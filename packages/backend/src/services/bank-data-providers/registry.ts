import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { t } from '@i18n/index';
import { logger } from '@js/utils';

import { BaseBankDataProvider } from './base-provider';
import { ProviderMetadata } from './types';

/**
 * Registry for managing bank data providers.
 * Implements the singleton pattern to ensure a single source of truth for available providers.
 *
 * Usage:
 *   - Register providers at app startup: providerRegistry.register(new MonobankProvider())
 *   - Get provider instance: providerRegistry.get(BANK_PROVIDER_TYPE.MONOBANK)
 *   - List all providers: providerRegistry.listAll()
 */
class BankProviderRegistry {
  private providers = new Map<BANK_PROVIDER_TYPE, BaseBankDataProvider>();
  private static instance: BankProviderRegistry;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance of the registry
   */
  public static getInstance(): BankProviderRegistry {
    if (!BankProviderRegistry.instance) {
      BankProviderRegistry.instance = new BankProviderRegistry();
    }
    return BankProviderRegistry.instance;
  }

  /**
   * Register a new provider
   * @param provider - Provider instance to register
   * @throws Error if provider type is already registered
   */
  register(provider: BaseBankDataProvider): void {
    const providerType = provider.metadata.type;

    if (this.providers.has(providerType)) {
      throw new Error(t({ key: 'errors.providerAlreadyRegistered', variables: { providerType } }));
    }

    this.providers.set(providerType, provider);
    logger.info(`Registered bank data provider: ${providerType}`);
  }

  /**
   * Get a provider by type
   * @param type - Provider type to retrieve
   * @returns Provider instance
   * @throws Error if provider type is not registered
   */
  get(type: BANK_PROVIDER_TYPE): BaseBankDataProvider {
    const provider = this.providers.get(type);

    if (!provider) {
      const available = Array.from(this.providers.keys()).join(', ') || 'none';
      throw new Error(t({ key: 'errors.providerNotRegistered', variables: { providerType: type, available } }));
    }

    return provider;
  }

  /**
   * Check if a provider type is registered
   * @param type - Provider type to check
   * @returns True if provider is registered
   */
  has(type: BANK_PROVIDER_TYPE): boolean {
    return this.providers.has(type);
  }

  /**
   * Get metadata for all registered providers
   * Useful for listing available providers in UI
   * @returns Array of provider metadata
   */
  listAll(): ProviderMetadata[] {
    return Array.from(this.providers.values()).map((provider) => provider.metadata);
  }

  /**
   * Get list of all registered provider types
   * @returns Array of provider types
   */
  listTypes(): BANK_PROVIDER_TYPE[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Validate that all required providers are registered
   * Useful for ensuring critical providers are available at startup
   * @param required - Array of provider types that must be registered
   * @throws Error if any required providers are missing
   */
  validateAllRegistered(required: BANK_PROVIDER_TYPE[]): void {
    const missing = required.filter((type) => !this.has(type));

    if (missing.length > 0) {
      throw new Error(t({ key: 'errors.missingRequiredProviders', variables: { missing: missing.join(', ') } }));
    }
  }

  /**
   * Get total count of registered providers
   * @returns Number of registered providers
   */
  getCount(): number {
    return this.providers.size;
  }

  /**
   * Clear all registered providers
   * WARNING: Should only be used for testing purposes
   */
  clearAll(): void {
    this.providers.clear();
    logger.warn('All bank data providers have been cleared from registry');
  }
}

// Export singleton instance
export const bankProviderRegistry = BankProviderRegistry.getInstance();
