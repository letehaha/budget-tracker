import { ASSET_CLASS, SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { sleep } from '@common/helpers';
import { logger } from '@js/utils';
import alpha from 'alphavantage';
import { endOfDay, isWithinInterval, startOfDay } from 'date-fns';

import {
  BaseSecurityDataProvider,
  HistoricalPriceOptions,
  PriceData,
  ProviderSymbol,
  SecurityPriceFetchInput,
  toProviderSymbol,
} from './base-provider';

export class AlphaVantageDataProvider extends BaseSecurityDataProvider {
  readonly providerName = SECURITY_PROVIDER.alphavantage;
  private client: ReturnType<typeof alpha>;

  constructor(apiKey: string) {
    super();
    this.client = alpha({ key: apiKey });
  }

  /**
   * Search for securities using Alpha Vantage search endpoint
   */
  public async searchSecurities(query: string): Promise<SecuritySearchResult[]> {
    try {
      logger.info(`Searching Alpha Vantage for: ${query}`);

      const searchResponse = await this.client.data.search(query);

      if (!searchResponse || !searchResponse['bestMatches']) {
        logger.info(`No search results found for query: ${query}`);
        return [];
      }

      const results: SecuritySearchResult[] = searchResponse['bestMatches'].map((match: Record<string, string>) => ({
        symbol: match['1. symbol']!,
        providerSymbol: match['1. symbol']!,
        name: match['2. name']!,
        assetClass: this.mapToAssetClass(match['3. type']!),
        providerName: this.providerName,
        exchangeName: match['4. region']!,
        currencyCode: match['8. currency']!,
        // Alpha Vantage search doesn't provide these fields, set as undefined
        exchangeAcronym: undefined,
        exchangeMic: undefined,
        cusip: undefined,
        isin: undefined,
      }));

      logger.info(`Found ${results.length} securities for query: ${query}`);
      return results;
    } catch (error) {
      logger.error({ message: 'Alpha Vantage search failed:', error: error as Error });
      throw new Error(`Alpha Vantage search failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        cause: error,
      });
    }
  }

  /**
   * Get latest price for a security
   */
  public async getLatestPrice(providerSymbol: ProviderSymbol): Promise<PriceData> {
    try {
      logger.info(`Fetching latest price for: ${providerSymbol}`);

      const quoteResponse = await this.client.data.quote(providerSymbol);

      if (!quoteResponse || !quoteResponse['Global Quote']) {
        throw new Error(`No quote data found for symbol: ${providerSymbol}`);
      }

      const quote = quoteResponse['Global Quote'];
      const priceClose = parseFloat(quote['05. price']);
      const latestTradingDay = new Date(quote['07. latest trading day']);

      const result: PriceData = {
        providerSymbol: toProviderSymbol(quote['01. symbol']),
        date: latestTradingDay,
        priceClose,
        priceAsOf: new Date(), // Current timestamp
        providerName: SECURITY_PROVIDER.alphavantage,
      };

      logger.info(`Latest price for ${providerSymbol}: ${priceClose} on ${latestTradingDay.toISOString()}`);
      return result;
    } catch (error) {
      logger.error({ message: `Failed to fetch latest price for ${providerSymbol}:`, error: error as Error });
      throw new Error(
        `Failed to fetch latest price for ${providerSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  }

  /**
   * Get historical prices for a security within a date range
   */
  public async getHistoricalPrices(
    providerSymbol: ProviderSymbol,
    options?: HistoricalPriceOptions,
  ): Promise<PriceData[]> {
    try {
      const startDate = options?.startDate;
      const endDate = options?.endDate;

      logger.info(
        `Fetching historical prices for: ${providerSymbol}${startDate && endDate ? ` from ${startDate.toISOString()} to ${endDate.toISOString()}` : ' (full dataset)'}`,
      );

      // Alpha Vantage TIME_SERIES_DAILY gives us historical data
      const timeSeriesResponse = await this.client.data.daily(providerSymbol, 'full');

      if (!timeSeriesResponse || !timeSeriesResponse['Time Series (Daily)']) {
        throw new Error(`No historical data found for symbol: ${providerSymbol}`);
      }

      const timeSeries = timeSeriesResponse['Time Series (Daily)'];
      const results: PriceData[] = [];

      // Process all dates, filter if date range is specified
      for (const [dateStr, dailyData] of Object.entries(timeSeries)) {
        const date = new Date(dateStr);

        // If no date range specified, include all data
        // If date range specified, check if date is within range
        if (!startDate || !endDate || isWithinInterval(date, { start: startDate, end: endDate })) {
          results.push({
            providerSymbol,
            date,
            priceClose: parseFloat((dailyData as Record<string, string>)['4. close']!),
            priceAsOf: new Date(), // Current timestamp
            providerName: SECURITY_PROVIDER.alphavantage,
          });
        }
      }

      // Sort by date ascending
      const sorted = results.toSorted((a, b) => a.date.getTime() - b.date.getTime());

      logger.info(
        `Found ${sorted.length} historical prices for ${providerSymbol}${startDate && endDate ? ' in date range' : ''}`,
      );
      return sorted;
    } catch (error) {
      logger.error({ message: `Failed to fetch historical prices for ${providerSymbol}:`, error: error as Error });
      throw new Error(
        `Failed to fetch historical prices for ${providerSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  }

  /**
   * Fetch prices for multiple securities efficiently with rate limiting.
   * Alpha Vantage has a 25 requests/day and 5 requests/minute limit.
   */
  public async fetchPricesForSecurities(securities: SecurityPriceFetchInput[], forDate: Date): Promise<PriceData[]> {
    const ALPHA_VANTAGE_DAILY_LIMIT = 25;
    const ALPHA_VANTAGE_MINUTE_LIMIT = 5;
    const MINUTE_DELAY = 60 * 1000 + 1000; // 61 seconds to be safe
    const REQUEST_DELAY = 12 * 1000; // 12 seconds between requests to stay under 5/minute

    if (securities.length === 0) {
      return [];
    }

    logger.info(`Alpha Vantage: Starting fetch for ${securities.length} securities`);

    // Apply daily limit
    const toProcess =
      securities.length > ALPHA_VANTAGE_DAILY_LIMIT ? securities.slice(0, ALPHA_VANTAGE_DAILY_LIMIT) : securities;

    if (toProcess.length < securities.length) {
      logger.warn(
        `Alpha Vantage daily limit reached: processing ${toProcess.length} of ${securities.length} securities`,
      );
    }

    const fetchedPrices: PriceData[] = [];
    let requestsThisMinute = 0;
    let lastRequestTime = 0;

    for (const { providerSymbol } of toProcess) {
      try {
        // Rate limiting: respect 5 requests per minute
        if (requestsThisMinute >= ALPHA_VANTAGE_MINUTE_LIMIT) {
          const timeSinceLastRequest = Date.now() - lastRequestTime;
          if (timeSinceLastRequest < MINUTE_DELAY) {
            const waitTime = MINUTE_DELAY - timeSinceLastRequest;
            logger.info(`Alpha Vantage rate limit: waiting ${waitTime}ms before next batch`);
            await sleep({ ms: waitTime });
          }
          requestsThisMinute = 0;
        }

        // Add delay between requests to stay under 5/minute
        if (lastRequestTime > 0) {
          const timeSinceLastRequest = Date.now() - lastRequestTime;
          if (timeSinceLastRequest < REQUEST_DELAY) {
            await sleep({ ms: REQUEST_DELAY - timeSinceLastRequest });
          }
        }

        lastRequestTime = Date.now();
        requestsThisMinute++;

        const historicalPrices = await this.getHistoricalPrices(providerSymbol, {
          startDate: startOfDay(forDate),
          endDate: endOfDay(forDate),
        });

        if (historicalPrices[0]) {
          const priceData = historicalPrices[0];
          fetchedPrices.push(priceData);
          logger.info(
            `Fetched price for ${providerSymbol} on ${forDate.toISOString().split('T')[0]}: ${priceData.priceClose}`,
          );
        } else {
          logger.info(`No price data found for ${providerSymbol} on ${forDate.toISOString().split('T')[0]}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // Per-symbol failures are expected (delisted, unsupported by provider, etc.).
        // The composite provider aggregates and reports if ALL providers fail.
        logger.info(`Failed to fetch price for ${providerSymbol}: ${errorMessage}`);
      }
    }

    logger.info(`Alpha Vantage fetch complete: ${fetchedPrices.length}/${toProcess.length} securities fetched`);
    return fetchedPrices;
  }

  /**
   * Map Alpha Vantage asset types to our internal ASSET_CLASS enum
   */
  private mapToAssetClass(alphaVantageType: string): ASSET_CLASS {
    const type = alphaVantageType?.toLowerCase() || '';

    if (type.includes('equity') || type.includes('stock')) {
      return ASSET_CLASS.stocks;
    }
    if (type.includes('crypto')) {
      return ASSET_CLASS.crypto;
    }
    if (type.includes('etf')) {
      return ASSET_CLASS.stocks; // Treat ETFs as stocks
    }

    return ASSET_CLASS.other;
  }
}
