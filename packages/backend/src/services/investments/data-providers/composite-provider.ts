import { SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';

import { AlphaVantageDataProvider } from './alphavantage-provider';
import { BaseSecurityDataProvider, HistoricalPriceOptions, PriceData } from './base-provider';
import { FmpDataProvider } from './fmp-provider';
import { PolygonDataProvider } from './polygon-provider';
import {
  getHistoricalPriceProviderPreference,
  getLatestPriceProviderPreference,
  getSearchProviderPreference,
} from './utils';
import { YahooDataProvider } from './yahoo-provider';

interface CompositeProviderOptions {
  fmpApiKey?: string;
  polygonApiKey?: string;
  alphaVantageApiKey?: string;
  /** Defaults to true (Yahoo requires no API key). Set to false to explicitly disable. */
  yahooEnabled?: boolean;
}

export class CompositeDataProvider extends BaseSecurityDataProvider {
  readonly providerName = SECURITY_PROVIDER.composite;

  private providers: Map<SECURITY_PROVIDER, BaseSecurityDataProvider> = new Map();

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

    if (options.yahooEnabled !== false) {
      this.providers.set(SECURITY_PROVIDER.yahoo, new YahooDataProvider());
    }

    logger.info(`Composite provider initialized with: ${Array.from(this.providers.keys()).join(', ')}`);
  }

  /**
   * Routes search requests to the best provider (typically Yahoo for global coverage)
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
  public async getHistoricalPrices(symbol: string, options?: HistoricalPriceOptions): Promise<PriceData[]> {
    const preference = getHistoricalPriceProviderPreference(symbol);

    const result = await this.executeWithFallback(
      preference.primary,
      preference.fallbacks,
      async (provider): Promise<PriceData[]> => {
        const prices = await provider.getHistoricalPrices(symbol, options);
        // Add the actual provider information to each price data point
        return prices.map((price) => ({
          ...price,
          providerName: provider.providerName,
        }));
      },
      `historical prices for ${symbol}`,
    );

    return result;
  }

  /**
   * Routes bulk price fetching to the best provider for each symbol.
   * Phase 1: Fetch from primary providers. Phase 2: Retry failed symbols with fallbacks.
   */
  public async fetchPricesForSecurities(symbols: string[], forDate: Date): Promise<PriceData[]> {
    // Group symbols by their preferred provider
    const symbolsByProvider = this.groupSymbolsByProvider(symbols);

    const allResults: PriceData[] = [];
    const failedSymbols: string[] = [];

    // Phase 1: Fetch from primary providers concurrently
    const fetchPromises = Array.from(symbolsByProvider.entries()).map(async ([providerName, symbolList]) => {
      const provider = this.providers.get(providerName);
      if (!provider) {
        logger.warn(`Provider ${providerName} not available, skipping ${symbolList.length} symbols`);
        return { fetched: [] as PriceData[], failed: symbolList };
      }

      try {
        logger.info(`Fetching prices for ${symbolList.length} symbols from ${providerName}`);
        const res = await provider.fetchPricesForSecurities(symbolList, forDate);
        // Detect partial failures: symbols requested but not returned
        const fetchedSymbols = new Set(res.map((p) => p.symbol));
        const failed = symbolList.filter((s) => !fetchedSymbols.has(s));
        return { fetched: res, failed };
      } catch (error) {
        logger.error({ message: `Provider ${providerName} failed for bulk fetch:`, error: error as Error });
        return { fetched: [] as PriceData[], failed: symbolList };
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const { fetched, failed } of results) {
      allResults.push(...fetched);
      failedSymbols.push(...failed);
    }

    // Phase 2: Retry failed symbols with fallback providers
    if (failedSymbols.length > 0) {
      logger.warn(
        `${failedSymbols.length} symbols failed primary provider, attempting fallbacks: ${failedSymbols.join(', ')}`,
      );

      const stillMissing: string[] = [];

      for (const symbol of failedSymbols) {
        const preference = getHistoricalPriceProviderPreference(symbol);
        // Skip the primary (already failed) and try only fallback providers
        const fallbackNames = preference.fallbacks.filter((f) => f !== preference.primary);
        let fetched = false;

        for (const fallbackName of fallbackNames) {
          const fallbackProvider = this.providers.get(fallbackName);
          if (!fallbackProvider) continue;

          try {
            const prices = await fallbackProvider.fetchPricesForSecurities([symbol], forDate);
            if (prices.length > 0) {
              allResults.push(...prices);
              fetched = true;
              logger.info(`Fallback ${fallbackName} succeeded for ${symbol}`);
              break;
            }
          } catch {
            // Continue to next fallback
          }
        }

        if (!fetched) {
          stillMissing.push(symbol);
        }
      }

      if (stillMissing.length > 0) {
        logger.error(
          `${stillMissing.length}/${symbols.length} symbols failed ALL providers: ${stillMissing.join(', ')}`,
        );
      }
    }

    logger.info(
      `Composite provider fetched ${allResults.length}/${symbols.length} prices from ${symbolsByProvider.size} providers`,
    );
    return allResults;
  }

  /**
   * Groups symbols by their preferred provider for bulk operations
   */
  private groupSymbolsByProvider(symbols: string[]): Map<SECURITY_PROVIDER, string[]> {
    const groups = new Map<SECURITY_PROVIDER, string[]>();

    symbols.forEach((symbol) => {
      const preference = getHistoricalPriceProviderPreference(symbol);
      const providerName = this.findAvailableProvider(preference.primary, preference.fallbacks);

      if (providerName) {
        const list = groups.get(providerName);
        if (list) {
          list.push(symbol);
        } else {
          groups.set(providerName, [symbol]);
        }
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
    primaryProvider: SECURITY_PROVIDER,
    fallbacks: SECURITY_PROVIDER[],
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
  private findAvailableProvider(primary: SECURITY_PROVIDER, fallbacks: SECURITY_PROVIDER[]): SECURITY_PROVIDER | null {
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
      [SECURITY_PROVIDER.yahoo]: this.providers.has(SECURITY_PROVIDER.yahoo),
      [SECURITY_PROVIDER.fmp]: this.providers.has(SECURITY_PROVIDER.fmp),
      [SECURITY_PROVIDER.polygon]: this.providers.has(SECURITY_PROVIDER.polygon),
      [SECURITY_PROVIDER.alphavantage]: this.providers.has(SECURITY_PROVIDER.alphavantage),
    };
  }
}
