import { SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';

import { AlphaVantageDataProvider } from './alphavantage-provider';
import { BaseSecurityDataProvider, PriceData } from './base-provider';
import { FmpDataProvider } from './fmp-provider';
import { PolygonDataProvider } from './polygon-provider';
import {
  getHistoricalPriceProviderPreference,
  getLatestPriceProviderPreference,
  getSearchProviderPreference,
} from './utils';

export interface CompositeProviderOptions {
  fmpApiKey?: string;
  polygonApiKey?: string;
  alphaVantageApiKey?: string;
}

export class CompositeDataProvider extends BaseSecurityDataProvider {
  readonly providerName = SECURITY_PROVIDER.composite;

  private providers: Map<string, BaseSecurityDataProvider> = new Map();

  constructor(options: CompositeProviderOptions) {
    super();

    // Initialize available providers
    if (options.fmpApiKey) {
      this.providers.set(SECURITY_PROVIDER.fmp, new FmpDataProvider(options.fmpApiKey));
    }

    if (options.polygonApiKey) {
      this.providers.set(SECURITY_PROVIDER.polygon, new PolygonDataProvider(options.polygonApiKey));
    }

    if (options.alphaVantageApiKey) {
      this.providers.set(SECURITY_PROVIDER.alphavantage, new AlphaVantageDataProvider(options.alphaVantageApiKey));
    }

    logger.info(`Composite provider initialized with: ${Array.from(this.providers.keys()).join(', ')}`);
  }

  /**
   * Routes search requests to the best provider (typically FMP for global coverage)
   */
  public async searchSecurities(query: string): Promise<SecuritySearchResult[]> {
    const preference = getSearchProviderPreference();

    return this.executeWithFallback(
      preference.primary,
      preference.fallbacks,
      (provider) => provider.searchSecurities(query),
      `search for "${query}"`,
    );
  }

  /**
   * Routes latest price requests based on symbol classification
   */
  public async getLatestPrice(symbol: string): Promise<PriceData> {
    const preference = getLatestPriceProviderPreference(symbol);

    return this.executeWithFallback(
      preference.primary,
      preference.fallbacks,
      (provider) => provider.getLatestPrice(symbol),
      `latest price for ${symbol}`,
    );
  }

  /**
   * Routes historical price requests based on symbol classification
   */
  public async getHistoricalPrices(symbol: string, startDate: Date, endDate: Date): Promise<PriceData[]> {
    const preference = getHistoricalPriceProviderPreference(symbol);

    return this.executeWithFallback(
      preference.primary,
      preference.fallbacks,
      (provider) => provider.getHistoricalPrices(symbol, startDate, endDate),
      `historical prices for ${symbol}`,
    );
  }

  /**
   * Routes bulk price fetching to the best provider for each symbol
   */
  public async fetchPricesForSecurities(symbols: string[], forDate: Date): Promise<PriceData[]> {
    // Group symbols by their preferred provider
    const symbolsByProvider = this.groupSymbolsByProvider(symbols);

    const allResults: PriceData[] = [];

    // Fetch from each provider concurrently
    const fetchPromises = Object.entries(symbolsByProvider).map(async ([providerName, symbolList]) => {
      const provider = this.providers.get(providerName);
      if (!provider) {
        logger.warn(`Provider ${providerName} not available, skipping ${symbolList.length} symbols`);
        return [];
      }

      try {
        logger.info(`Fetching prices for ${symbolList.length} symbols from ${providerName}`);
        return await provider.fetchPricesForSecurities(symbolList, forDate);
      } catch (error) {
        logger.error({ message: `Provider ${providerName} failed for bulk fetch:`, error: error as Error });
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    results.forEach((result) => allResults.push(...result));

    logger.info(
      `Composite provider fetched ${allResults.length} prices from ${Object.keys(symbolsByProvider).length} providers`,
    );
    return allResults;
  }

  /**
   * Groups symbols by their preferred provider for bulk operations
   */
  private groupSymbolsByProvider(symbols: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};

    symbols.forEach((symbol) => {
      const preference = getHistoricalPriceProviderPreference(symbol);
      const providerName = this.findAvailableProvider(preference.primary, preference.fallbacks);

      if (providerName) {
        if (!groups[providerName]) {
          groups[providerName] = [];
        }
        groups[providerName].push(symbol);
      } else {
        logger.warn(`No available provider for symbol: ${symbol}`);
      }
    });

    return groups;
  }

  /**
   * Executes an operation with fallback logic
   */
  private async executeWithFallback<T>(
    primaryProvider: string,
    fallbacks: string[],
    operation: (provider: BaseSecurityDataProvider) => Promise<T>,
    operationName: string,
  ): Promise<T> {
    const providers = [primaryProvider, ...fallbacks];

    for (const providerName of providers) {
      const provider = this.providers.get(providerName);

      if (!provider) {
        logger.info(`Provider ${providerName} not available for ${operationName}`);
        continue;
      }

      try {
        logger.info(`Attempting ${operationName} with ${providerName}`);
        const result = await operation(provider);
        logger.info(`Successfully completed ${operationName} with ${providerName}`);
        return result;
      } catch (error) {
        logger.error({ message: `Provider ${providerName} failed for ${operationName}:`, error: error as Error });

        // If this was the last provider, throw the error
        if (providerName === providers[providers.length - 1]) {
          throw error;
        }
      }
    }

    throw new Error(`All providers failed for ${operationName}`);
  }

  /**
   * Finds the first available provider from a preference list
   */
  private findAvailableProvider(primary: string, fallbacks: string[]): string | null {
    const candidates = [primary, ...fallbacks];

    for (const candidate of candidates) {
      if (this.providers.has(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Get status of all configured providers
   */
  public getProviderStatus(): Record<string, boolean> {
    return {
      fmp: this.providers.has('fmp'),
      polygon: this.providers.has('polygon'),
      alphavantage: this.providers.has('alphavantage'),
    };
  }
}
