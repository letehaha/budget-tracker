import { SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';

import { AlphaVantageDataProvider } from './alphavantage-provider';
import { BaseSecurityDataProvider, HistoricalPriceOptions, PriceData, SecurityPriceFetchInput } from './base-provider';
import { FmpDataProvider } from './fmp-provider';
import { PolygonDataProvider } from './polygon-provider';
import {
  getHistoricalPriceProviderPreference,
  getLatestPriceProviderPreference,
  getSearchProviderPreference,
  partitionByMarketStatus,
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
  public async fetchPricesForSecurities(securities: SecurityPriceFetchInput[], forDate: Date): Promise<PriceData[]> {
    const securitiesByProvider = this.groupSecuritiesByProvider(securities);

    const allResults: PriceData[] = [];
    const failedSecurities: SecurityPriceFetchInput[] = [];

    // Phase 1: Fetch from primary providers concurrently
    const fetchPromises = Array.from(securitiesByProvider.entries()).map(async ([providerName, securityList]) => {
      const provider = this.providers.get(providerName);
      if (!provider) {
        logger.info(`Provider ${providerName} not available, skipping ${securityList.length} symbols`);
        return { fetched: [] as PriceData[], failed: securityList };
      }

      try {
        logger.info(`Fetching prices for ${securityList.length} symbols from ${providerName}`);
        const res = await provider.fetchPricesForSecurities(securityList, forDate);
        // Detect partial failures: symbols requested but not returned
        const fetchedSymbols = new Set(res.map((p) => p.symbol));
        const failed = securityList.filter((s) => !fetchedSymbols.has(s.symbol));
        return { fetched: res, failed };
      } catch (error) {
        logger.error({ message: `Provider ${providerName} failed for bulk fetch:`, error: error as Error });
        return { fetched: [] as PriceData[], failed: securityList };
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const { fetched, failed } of results) {
      allResults.push(...fetched);
      failedSecurities.push(...failed);
    }

    // Phase 2: Retry failed symbols with fallback providers
    if (failedSecurities.length > 0) {
      logger.info(
        `${failedSecurities.length} symbols failed primary provider, attempting fallbacks: ${failedSecurities.map((s) => s.symbol).join(', ')}`,
      );

      const stillMissing: SecurityPriceFetchInput[] = [];

      for (const security of failedSecurities) {
        const preference = getHistoricalPriceProviderPreference(security.symbol);
        // Skip the primary (already failed) and try only fallback providers
        const fallbackNames = preference.fallbacks.filter((f) => f !== preference.primary);
        let fetched = false;

        for (const fallbackName of fallbackNames) {
          const fallbackProvider = this.providers.get(fallbackName);
          if (!fallbackProvider) continue;

          try {
            const prices = await fallbackProvider.fetchPricesForSecurities([security], forDate);
            if (prices.length > 0) {
              allResults.push(...prices);
              fetched = true;
              logger.info(`Fallback ${fallbackName} succeeded for ${security.symbol}`);
              break;
            }
          } catch (error) {
            logger.warn(`Fallback ${fallbackName} threw for ${security.symbol}: ${(error as Error).message}`);
          }
        }

        if (!fetched) {
          stillMissing.push(security);
        }
      }

      if (stillMissing.length > 0) {
        const { expectedClosed, actuallyMissing } = partitionByMarketStatus({
          items: stillMissing,
          date: forDate,
        });

        if (expectedClosed.length > 0) {
          logger.info(
            `${expectedClosed.length}/${securities.length} symbols had no data because their markets were closed on ${forDate.toISOString()}: ${expectedClosed.map((s) => s.symbol).join(', ')}`,
          );
        }

        if (actuallyMissing.length > 0) {
          logger.error(
            `${actuallyMissing.length}/${securities.length} symbols failed ALL providers: ${actuallyMissing.map((s) => s.symbol).join(', ')}`,
          );
        }
      }
    }

    logger.info(
      `Composite provider fetched ${allResults.length}/${securities.length} prices from ${securitiesByProvider.size} providers`,
    );
    return allResults;
  }

  /**
   * Groups securities by their preferred provider for bulk operations
   */
  private groupSecuritiesByProvider(
    securities: SecurityPriceFetchInput[],
  ): Map<SECURITY_PROVIDER, SecurityPriceFetchInput[]> {
    const groups = new Map<SECURITY_PROVIDER, SecurityPriceFetchInput[]>();

    securities.forEach((security) => {
      const preference = getHistoricalPriceProviderPreference(security.symbol);
      const providerName = this.findAvailableProvider(preference.primary, preference.fallbacks);

      if (providerName) {
        const list = groups.get(providerName);
        if (list) {
          list.push(security);
        } else {
          groups.set(providerName, [security]);
        }
      } else {
        logger.warn(`No available provider for symbol: ${security.symbol}`);
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
