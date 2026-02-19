/**
 * Registry for managing exchange rate providers.
 * Implements the singleton pattern and provides priority-based fallback fetching.
 *
 * Usage:
 *   - Register providers at app startup: registry.register(new CurrencyRatesApiProvider())
 *   - Get provider instance: registry.get(EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API)
 *   - Fetch with fallback: registry.fetchRatesWithFallback({ date: new Date() })
 */
import { logger } from '@js/utils';

import { BaseExchangeRateProvider } from './base-provider';
import {
  EXCHANGE_RATE_PROVIDER_TYPE,
  ExchangeRateProviderMetadata,
  FetchHistoricalRatesWithFallbackResult,
  FetchRatesParams,
  FetchRatesRangeParams,
  FetchRatesWithFallbackResult,
} from './types';

class ExchangeRateProviderRegistry {
  private providers = new Map<EXCHANGE_RATE_PROVIDER_TYPE, BaseExchangeRateProvider>();
  private static instance: ExchangeRateProviderRegistry;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance of the registry
   */
  public static getInstance(): ExchangeRateProviderRegistry {
    if (!ExchangeRateProviderRegistry.instance) {
      ExchangeRateProviderRegistry.instance = new ExchangeRateProviderRegistry();
    }
    return ExchangeRateProviderRegistry.instance;
  }

  /**
   * Register a new provider
   * @param provider - Provider instance to register
   * @throws Error if provider type is already registered
   */
  register(provider: BaseExchangeRateProvider): void {
    const providerType = provider.metadata.type;

    if (this.providers.has(providerType)) {
      throw new Error(`Provider ${providerType} is already registered. Cannot register duplicate providers.`);
    }

    this.providers.set(providerType, provider);
    logger.info(
      `Registered exchange rate provider: ${provider.metadata.name} (priority: ${provider.metadata.priority})`,
    );
  }

  /**
   * Get a provider by type
   * @param type - Provider type to retrieve
   * @returns Provider instance or undefined if not registered
   */
  get(type: EXCHANGE_RATE_PROVIDER_TYPE): BaseExchangeRateProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Check if a provider type is registered
   * @param type - Provider type to check
   * @returns True if provider is registered
   */
  has(type: EXCHANGE_RATE_PROVIDER_TYPE): boolean {
    return this.providers.has(type);
  }

  /**
   * Get metadata for all registered providers
   * @returns Array of provider metadata sorted by priority
   */
  listAll(): ExchangeRateProviderMetadata[] {
    return Array.from(this.providers.values())
      .map((provider) => provider.metadata)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get list of all registered provider types
   * @returns Array of provider types
   */
  listTypes(): EXCHANGE_RATE_PROVIDER_TYPE[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get providers sorted by priority (lowest priority number = highest priority)
   * Only returns providers that are currently available
   * @returns Array of provider instances sorted by priority
   */
  async getByPriority(): Promise<BaseExchangeRateProvider[]> {
    const sorted = Array.from(this.providers.values()).sort((a, b) => a.metadata.priority - b.metadata.priority);

    const available: BaseExchangeRateProvider[] = [];
    for (const provider of sorted) {
      try {
        const isAvailable = await provider.isAvailable();
        if (isAvailable) {
          available.push(provider);
        } else {
          logger.info(`Provider ${provider.metadata.name} is not available, skipping`);
        }
      } catch (error) {
        logger.warn(`Error checking availability for ${provider.metadata.name}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return available;
  }

  /**
   * Fetch exchange rates with automatic fallback through providers by priority.
   * Tries each provider in order until one succeeds.
   * @param params - Fetch parameters
   * @returns Exchange rate result with provider info, or null if all providers fail
   */
  async fetchRatesWithFallback(params: FetchRatesParams): Promise<FetchRatesWithFallbackResult | null> {
    const providers = await this.getByPriority();

    if (providers.length === 0) {
      logger.error('No exchange rate providers are available');
      return null;
    }

    const failedProviders: { name: string; type: EXCHANGE_RATE_PROVIDER_TYPE; error?: string }[] = [];

    for (const provider of providers) {
      try {
        logger.info(`Attempting to fetch rates from ${provider.metadata.name}`);
        const result = await provider.fetchRatesForDate(params);

        if (result && Object.keys(result.rates).length > 0) {
          logger.info(`Successfully fetched ${Object.keys(result.rates).length} rates from ${provider.metadata.name}`);

          // Alert: Frankfurter was used (ideally should never happen if currency-rates-api works)
          if (provider.metadata.type === EXCHANGE_RATE_PROVIDER_TYPE.FRANKFURTER) {
            logger.warn(`[ALERT:FRANKFURTER_USED] Frankfurter fallback was triggered`, {
              failedProviders: failedProviders.map((p) => p.name),
              date: params.date.toISOString(),
            });
          }

          // Alert: Currency Rates API failed but another provider succeeded
          const currencyRatesApiFailed = failedProviders.some(
            (p) => p.type === EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API,
          );
          if (currencyRatesApiFailed) {
            const failedProvider = failedProviders.find(
              (p) => p.type === EXCHANGE_RATE_PROVIDER_TYPE.CURRENCY_RATES_API,
            );
            logger.warn(`[ALERT:CURRENCY_RATES_API_FAILED] Primary provider failed`, {
              error: failedProvider?.error,
              fallbackProvider: provider.metadata.name,
              date: params.date.toISOString(),
            });
          }

          return {
            result,
            providerName: provider.metadata.name,
            providerType: provider.metadata.type,
          };
        }

        logger.warn(`${provider.metadata.name} returned no rates, trying next provider`);
        failedProviders.push({
          name: provider.metadata.name,
          type: provider.metadata.type,
          error: 'No rates returned',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`${provider.metadata.name} failed, trying next provider`, { error: errorMessage });
        failedProviders.push({
          name: provider.metadata.name,
          type: provider.metadata.type,
          error: errorMessage,
        });
      }
    }

    logger.error('All exchange rate providers failed to fetch rates');
    return null;
  }

  /**
   * Get providers that support efficient historical data loading, sorted by priority.
   * Only returns available providers that have supportsHistoricalDataLoading=true.
   * @returns Array of provider instances sorted by priority
   */
  async getHistoricalDataProviders(): Promise<BaseExchangeRateProvider[]> {
    const allAvailable = await this.getByPriority();
    return allAvailable.filter((provider) => provider.metadata.supportsHistoricalDataLoading === true);
  }

  /**
   * Fetch historical exchange rates for a date range with automatic fallback.
   * Only tries providers that support efficient historical data loading.
   * @param params - Fetch parameters including date range
   * @returns Historical rate results with provider info, or null if no provider supports it
   */
  async fetchHistoricalRatesWithFallback(
    params: FetchRatesRangeParams,
  ): Promise<FetchHistoricalRatesWithFallbackResult | null> {
    const providers = await this.getHistoricalDataProviders();

    if (providers.length === 0) {
      logger.error('No exchange rate providers support historical data loading');
      return null;
    }

    for (const provider of providers) {
      try {
        logger.info(`Attempting to fetch historical rates from ${provider.metadata.name}`);
        const results = await provider.fetchRatesForDateRange(params);

        if (results && results.length > 0) {
          logger.info(`Successfully fetched ${results.length} date entries from ${provider.metadata.name}`);
          return {
            results,
            providerName: provider.metadata.name,
            providerType: provider.metadata.type,
          };
        }

        logger.warn(`${provider.metadata.name} returned no historical rates, trying next provider`);
      } catch (error) {
        logger.warn(`${provider.metadata.name} failed to fetch historical rates, trying next provider`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.error('All providers failed to fetch historical rates');
    return null;
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
    logger.warn('All exchange rate providers have been cleared from registry');
  }

  /**
   * Get the earliest historical date supported by any provider that supports historical data loading.
   * Returns the earliest minHistoricalDate from all providers with supportsHistoricalDataLoading=true.
   * @returns The earliest Date, or null if no providers support historical data
   */
  getEarliestHistoricalDate(): Date | null {
    const historicalProviders = Array.from(this.providers.values()).filter(
      (provider) => provider.metadata.supportsHistoricalDataLoading === true,
    );

    if (historicalProviders.length === 0) {
      return null;
    }

    let earliestDate: Date | null = null;

    for (const provider of historicalProviders) {
      if (provider.metadata.minHistoricalDate) {
        const providerDate = new Date(provider.metadata.minHistoricalDate);
        if (!earliestDate || providerDate < earliestDate) {
          earliestDate = providerDate;
        }
      }
    }

    return earliestDate;
  }

  /**
   * Get all unique currencies supported by providers that support historical data loading.
   * Returns the union of all supported currencies from these providers.
   * @returns Array of unique currency codes, or empty array if a provider supports all currencies
   */
  getSupportedCurrenciesForHistoricalData(): string[] {
    const historicalProviders = Array.from(this.providers.values()).filter(
      (provider) => provider.metadata.supportsHistoricalDataLoading === true,
    );

    if (historicalProviders.length === 0) {
      return [];
    }

    const allCurrencies = new Set<string>();

    for (const provider of historicalProviders) {
      // If a provider has no supportedCurrencies list, it supports all currencies
      if (!provider.metadata.supportedCurrencies) {
        // Return empty to indicate "all currencies supported"
        return [];
      }

      for (const currency of provider.metadata.supportedCurrencies) {
        allCurrencies.add(currency);
      }
    }

    return Array.from(allCurrencies).sort();
  }

  /**
   * Check if a currency is supported by any provider that supports historical data loading.
   * @param currencyCode - The currency code to check
   * @returns True if the currency is supported, false otherwise
   */
  isCurrencySupportedForHistoricalData(currencyCode: string): boolean {
    const supportedCurrencies = this.getSupportedCurrenciesForHistoricalData();

    // Empty array means all currencies are supported (a provider has no restrictions)
    if (supportedCurrencies.length === 0) {
      // Check if we have any historical providers at all
      const hasHistoricalProviders = Array.from(this.providers.values()).some(
        (provider) => provider.metadata.supportsHistoricalDataLoading === true,
      );
      return hasHistoricalProviders;
    }

    return supportedCurrencies.includes(currencyCode.toUpperCase());
  }
}

// Export singleton instance
export const exchangeRateProviderRegistry = ExchangeRateProviderRegistry.getInstance();
