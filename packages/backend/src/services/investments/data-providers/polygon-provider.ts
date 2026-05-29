import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import * as requestsUtils from '@js/utils/requests-calling.utils';
import {
  type IAggs,
  type IAggsGroupedDaily,
  type IRestClient,
  type ITickersQuery,
  restClient,
} from '@polygon.io/client-js';
import { isAxiosError } from 'axios';
import { formatDate, subYears } from 'date-fns';

import {
  BaseSecurityDataProvider,
  BulkPriceData,
  HistoricalPriceOptions,
  PriceData,
  ProviderSymbol,
  SecurityPriceFetchInput,
  toProviderSymbol,
} from './base-provider';

// Since the library doesn't export these types directly, we derive them.
type TickerTypes = ITickersQuery['type'];

export class PolygonDataProvider extends BaseSecurityDataProvider {
  readonly providerName = SECURITY_PROVIDER.polygon;
  private client: IRestClient;
  private reateLimitDelay = 15_000; // 15 seconds for 5 calls/min with buffer

  constructor(apiKey: string) {
    super();
    this.client = restClient(apiKey);
  }

  // https://polygon.io/docs/rest/stocks/aggregates/daily-market-summary
  private async getDailyPrices(date: Date): Promise<PriceData[]> {
    const dateStr = formatDate(date, 'yyyy-MM-dd');
    logger.info(`Fetching all daily pricing for ${dateStr} from Polygon.`);

    const allPricing: IAggsGroupedDaily = await requestsUtils.withRetry(
      () =>
        this.client.stocks.aggregatesGroupedDaily(dateStr, {
          adjusted: 'true',
        }),
      {
        delay: this.reateLimitDelay,
        maxRetries: 3,
        onError(error, attempt) {
          if (isAxiosError(error)) {
            // Only retry on rate limit errors
            if (error.response?.status === 429) {
              logger.info(`Rate limit hit on Polygon daily prices (attempt ${attempt}), retrying...`);
              return true;
            }
            // Composite provider aggregates and reports if all providers fail.
            const errorMsg = error.response?.data?.message || error.message;
            logger.info(`Non-retryable error on Polygon daily prices (attempt ${attempt}): ${errorMsg}`);
            return false; // stop retrying
          } else {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.info(`Unexpected error on Polygon daily prices (attempt ${attempt}): ${errorMsg}`);
            return false; // stop retrying
          }
        },
      },
    );

    if (!allPricing.results || !allPricing.results.length) {
      logger.info(`No daily prices found for ${dateStr}.`);
      return [];
    }

    return allPricing.results.map((price) => {
      const priceDate = new Date(price.t!);
      return {
        providerSymbol: toProviderSymbol(price.T!),
        date: priceDate,
        priceClose: price.c!,
        priceAsOf: priceDate,
        providerName: SECURITY_PROVIDER.polygon,
      };
    });
  }

  public async getHistoricalPrices(
    providerSymbol: ProviderSymbol,
    options?: HistoricalPriceOptions,
  ): Promise<PriceData[]> {
    // Default to getting full available data (up to 5 years) if no options provided
    const defaultEndDate = options?.endDate || new Date();
    const defaultStartDate = options?.startDate || subYears(defaultEndDate, 5);

    const response: IAggs = await this.client.stocks.aggregates(
      providerSymbol,
      1,
      'day',
      formatDate(defaultStartDate, 'yyyy-MM-dd'),
      formatDate(defaultEndDate, 'yyyy-MM-dd'),
    );

    return (
      response.results
        ?.filter((bar) => bar.c && bar.t)
        .map((bar) => {
          const date = new Date(bar.t!);
          return {
            providerSymbol,
            date,
            priceClose: bar.c!,
            priceAsOf: date,
            providerName: SECURITY_PROVIDER.polygon,
          };
        }) || []
    );
  }

  /**
   * Search for securities using Polygon search endpoint
   * Note: This method is implemented for interface compliance but may have limited functionality
   * compared to dedicated search providers like Alpha Vantage
   */
  public async searchSecurities(query: string): Promise<SecuritySearchResult[]> {
    try {
      logger.info(`Searching Polygon for: ${query}`);

      // Polygon doesn't have a dedicated search endpoint, so we'll use the ticker details
      // This is a simplified implementation - in practice, we might want to use a more robust search
      const tickerDetails = await this.client.reference.tickerDetails(query);

      if (!tickerDetails.results) {
        logger.info(`No search results found for query: ${query}`);
        return [];
      }

      const symbol = tickerDetails.results.ticker || query;
      const result: SecuritySearchResult = {
        symbol,
        providerSymbol: symbol,
        name: tickerDetails.results.name || 'Unknown',
        assetClass: this.mapAssetClass(tickerDetails.results.type as TickerTypes),
        providerName: this.providerName,
        exchangeName: tickerDetails.results.primary_exchange,
        currencyCode: tickerDetails.results.currency_name || 'USD',
        exchangeAcronym: tickerDetails.results.primary_exchange,
        exchangeMic: tickerDetails.results.market,
        cusip: undefined, // Polygon ticker details may not include CUSIP
        // Note: Polygon doesn't provide ISIN in ticker details
        isin: undefined,
      };

      logger.info(`Found security for query: ${query}`);
      return [result];
    } catch (error) {
      logger.error({ message: 'Polygon search failed', error: error as Error });
      // Return empty array instead of throwing - search failures should be non-blocking
      return [];
    }
  }

  /**
   * Get latest price for a security using Polygon
   */
  public async getLatestPrice(providerSymbol: ProviderSymbol): Promise<PriceData> {
    try {
      logger.info(`Fetching latest price for: ${providerSymbol}`);

      // Use previous close endpoint for latest price
      const response = await this.client.stocks.previousClose(providerSymbol);

      if (!response.results || response.results.length === 0) {
        throw new Error(`No quote data found for symbol: ${providerSymbol}`);
      }

      const quote = response.results[0];
      if (!quote) {
        throw new Error(`No quote data found for symbol: ${providerSymbol}`);
      }

      const result: PriceData = {
        providerSymbol: quote.T ? toProviderSymbol(quote.T) : providerSymbol,
        date: new Date(quote.t || Date.now()),
        priceClose: quote.c || 0,
        priceAsOf: new Date(), // Current timestamp
        providerName: SECURITY_PROVIDER.polygon,
      };

      logger.info(`Latest price for ${providerSymbol}: ${result.priceClose} on ${result.date.toISOString()}`);
      return result;
    } catch (error) {
      throw this.formatProviderError({ operation: `Failed to fetch latest price for ${providerSymbol}`, error });
    }
  }

  /**
   * Fetch prices for multiple securities efficiently using batch daily prices API.
   * Makes a single API call to get all daily prices, then filters for requested symbols.
   */
  public async fetchPricesForSecurities(
    securities: SecurityPriceFetchInput[],
    forDate: Date,
  ): Promise<Map<string, BulkPriceData>> {
    const result = new Map<string, BulkPriceData>();
    if (securities.length === 0) {
      return result;
    }

    logger.info(`Polygon: Starting batch fetch for ${securities.length} securities using getDailyPrices`);

    // Fetch all daily prices in a single API call
    const allDailyPrices = await this.getDailyPrices(forDate);

    if (allDailyPrices.length === 0) {
      logger.info(`No daily prices available for date: ${forDate.toISOString().split('T')[0]}`);
      return result;
    }

    // Create a map for quick lookup of prices by provider-native id
    const priceMap = new Map<ProviderSymbol, PriceData>();
    allDailyPrices.forEach((price) => {
      priceMap.set(price.providerSymbol, price);
    });

    for (const security of securities) {
      const priceData = priceMap.get(security.providerSymbol);

      if (!priceData) {
        logger.info(
          `No price data found for symbol: ${security.providerSymbol} on ${forDate.toISOString().split('T')[0]}`,
        );
        continue;
      }

      result.set(security.securityId, { ...priceData, securityId: security.securityId });
      logger.info(`Fetched price for ${security.providerSymbol}: ${priceData.priceClose}`);
    }

    logger.info(`Polygon batch fetch complete: ${result.size}/${securities.length} securities fetched`);
    return result;
  }

  private mapAssetClass(polygonType?: TickerTypes): ASSET_CLASS {
    switch (polygonType) {
      case 'CS':
      case 'ADRC':
        return ASSET_CLASS.stocks;
      case 'ETF':
        return ASSET_CLASS.stocks;
      default:
        return ASSET_CLASS.other;
    }
  }
}
