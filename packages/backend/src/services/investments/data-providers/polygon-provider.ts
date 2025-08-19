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
import { formatDate } from 'date-fns';

import { BaseSecurityDataProvider, PriceData } from './base-provider';

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
              logger.warn(`Rate limit hit on Polygon daily prices (attempt ${attempt}), retrying...`);
              return true;
            }
            logger.error({ message: `Non-retryable error on Polygon daily prices (attempt ${attempt}).`, error });
            return false; // stop retrying
          } else {
            logger.error({ message: 'Unexpected error', error: error as Error });
          }
        },
      },
    );

    if (!allPricing.results) {
      logger.warn(`No daily prices found for ${dateStr}.`);
      return [];
    }

    return allPricing.results
      .filter((price) => price.T && price.c && price.t)
      .map((price) => ({
        symbol: price.T!,
        date: new Date(price.t!),
        priceClose: price.c!,
      }));
  }

  public async getHistoricalPrices(symbol: string, startDate: Date, endDate: Date): Promise<PriceData[]> {
    const response: IAggs = await this.client.stocks.aggregates(
      symbol,
      1,
      'day',
      formatDate(startDate, 'yyyy-MM-dd'),
      formatDate(endDate, 'yyyy-MM-dd'),
    );

    return (
      response.results
        ?.filter((bar) => bar.c && bar.t)
        .map((bar) => ({
          symbol,
          date: new Date(bar.t!),
          priceClose: bar.c!,
        })) || []
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
        logger.warn(`No search results found for query: ${query}`);
        return [];
      }

      const result: SecuritySearchResult = {
        symbol: tickerDetails.results.ticker || query,
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
  public async getLatestPrice(symbol: string): Promise<PriceData> {
    try {
      logger.info(`Fetching latest price for: ${symbol}`);

      // Use previous close endpoint for latest price
      const response = await this.client.stocks.previousClose(symbol);

      if (!response.results || response.results.length === 0) {
        throw new Error(`No quote data found for symbol: ${symbol}`);
      }

      const quote = response.results[0];
      if (!quote) {
        throw new Error(`No quote data found for symbol: ${symbol}`);
      }

      const result: PriceData = {
        symbol: quote.T || symbol,
        date: new Date(quote.t || Date.now()),
        priceClose: quote.c || 0,
        priceAsOf: new Date(), // Current timestamp
      };

      logger.info(`Latest price for ${symbol}: ${result.priceClose} on ${result.date.toISOString()}`);
      return result;
    } catch (error) {
      logger.error({ message: `Failed to fetch latest price for ${symbol}`, error: error as Error });
      throw new Error(
        `Failed to fetch latest price for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Fetch prices for multiple securities efficiently using batch daily prices API.
   * Makes a single API call to get all daily prices, then filters for requested symbols.
   */
  public async fetchPricesForSecurities(symbols: string[], forDate: Date): Promise<PriceData[]> {
    if (symbols.length === 0) {
      return [];
    }

    logger.info(`Polygon: Starting batch fetch for ${symbols.length} securities using getDailyPrices`);

    // Fetch all daily prices in a single API call
    const allDailyPrices = await this.getDailyPrices(forDate);

    if (allDailyPrices.length === 0) {
      logger.warn(`No daily prices available for date: ${forDate.toISOString().split('T')[0]}`);
      return [];
    }

    // Create a map for quick lookup of prices by symbol
    const priceMap = new Map<string, PriceData>();
    allDailyPrices.forEach((price) => {
      priceMap.set(price.symbol, price);
    });

    const fetchedPrices: PriceData[] = [];

    // Process each requested symbol
    for (const symbol of symbols) {
      const priceData = priceMap.get(symbol);

      if (!priceData) {
        logger.info(`No price data found for symbol: ${symbol} on ${forDate.toISOString().split('T')[0]}`);
        continue;
      }

      fetchedPrices.push(priceData);
      logger.info(`Fetched price for ${symbol}: ${priceData.priceClose}`);
    }

    logger.info(`Polygon batch fetch complete: ${fetchedPrices.length}/${symbols.length} securities fetched`);
    return fetchedPrices;
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
