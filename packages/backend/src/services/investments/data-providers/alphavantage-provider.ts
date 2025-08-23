import { ASSET_CLASS, SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import alpha from 'alphavantage';
import { endOfDay, isWithinInterval, startOfDay } from 'date-fns';

import { BaseSecurityDataProvider, HistoricalPriceOptions, PriceData } from './base-provider';

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
        logger.warn(`No search results found for query: ${query}`);
        return [];
      }

      const results: SecuritySearchResult[] = searchResponse['bestMatches'].map((match: Record<string, string>) => ({
        symbol: match['1. symbol']!,
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
      throw new Error(`Alpha Vantage search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get latest price for a security
   */
  public async getLatestPrice(symbol: string): Promise<PriceData> {
    try {
      logger.info(`Fetching latest price for: ${symbol}`);

      const quoteResponse = await this.client.data.quote(symbol);

      if (!quoteResponse || !quoteResponse['Global Quote']) {
        throw new Error(`No quote data found for symbol: ${symbol}`);
      }

      const quote = quoteResponse['Global Quote'];
      const priceClose = parseFloat(quote['05. price']);
      const latestTradingDay = new Date(quote['07. latest trading day']);

      const result: PriceData = {
        symbol: quote['01. symbol'],
        date: latestTradingDay,
        priceClose,
        priceAsOf: new Date(), // Current timestamp
        providerName: SECURITY_PROVIDER.alphavantage,
      };

      logger.info(`Latest price for ${symbol}: ${priceClose} on ${latestTradingDay.toISOString()}`);
      return result;
    } catch (error) {
      logger.error({ message: `Failed to fetch latest price for ${symbol}:`, error: error as Error });
      throw new Error(
        `Failed to fetch latest price for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get historical prices for a security within a date range
   */
  public async getHistoricalPrices(symbol: string, options?: HistoricalPriceOptions): Promise<PriceData[]> {
    try {
      const startDate = options?.startDate;
      const endDate = options?.endDate;

      logger.info(
        `Fetching historical prices for: ${symbol}${startDate && endDate ? ` from ${startDate.toISOString()} to ${endDate.toISOString()}` : ' (full dataset)'}`,
      );

      // Alpha Vantage TIME_SERIES_DAILY gives us historical data
      const timeSeriesResponse = await this.client.data.daily(symbol, 'full');

      if (!timeSeriesResponse || !timeSeriesResponse['Time Series (Daily)']) {
        throw new Error(`No historical data found for symbol: ${symbol}`);
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
            symbol,
            date,
            priceClose: parseFloat((dailyData as Record<string, string>)['4. close']!),
            priceAsOf: new Date(), // Current timestamp
            providerName: SECURITY_PROVIDER.alphavantage,
          });
        }
      }

      // Sort by date ascending
      results.sort((a, b) => a.date.getTime() - b.date.getTime());

      logger.info(
        `Found ${results.length} historical prices for ${symbol}${startDate && endDate ? ' in date range' : ''}`,
      );
      return results;
    } catch (error) {
      logger.error({ message: `Failed to fetch historical prices for ${symbol}:`, error: error as Error });
      throw new Error(
        `Failed to fetch historical prices for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Fetch prices for multiple securities efficiently with rate limiting.
   * Alpha Vantage has a 25 requests/day and 5 requests/minute limit.
   */
  public async fetchPricesForSecurities(symbols: string[], forDate: Date): Promise<PriceData[]> {
    const ALPHA_VANTAGE_DAILY_LIMIT = 25;
    const ALPHA_VANTAGE_MINUTE_LIMIT = 5;
    const MINUTE_DELAY = 60 * 1000 + 1000; // 61 seconds to be safe
    const REQUEST_DELAY = 12 * 1000; // 12 seconds between requests to stay under 5/minute

    if (symbols.length === 0) {
      return [];
    }

    logger.info(`Alpha Vantage: Starting fetch for ${symbols.length} securities`);

    // Apply daily limit
    const symbolsToProcess =
      symbols.length > ALPHA_VANTAGE_DAILY_LIMIT ? symbols.slice(0, ALPHA_VANTAGE_DAILY_LIMIT) : symbols;

    if (symbolsToProcess.length < symbols.length) {
      logger.warn(
        `Alpha Vantage daily limit reached: processing ${symbolsToProcess.length} of ${symbols.length} securities`,
      );
    }

    const fetchedPrices: PriceData[] = [];
    let requestsThisMinute = 0;
    let lastRequestTime = 0;

    for (const symbol of symbolsToProcess) {
      try {
        // Rate limiting: respect 5 requests per minute
        if (requestsThisMinute >= ALPHA_VANTAGE_MINUTE_LIMIT) {
          const timeSinceLastRequest = Date.now() - lastRequestTime;
          if (timeSinceLastRequest < MINUTE_DELAY) {
            const waitTime = MINUTE_DELAY - timeSinceLastRequest;
            logger.info(`Alpha Vantage rate limit: waiting ${waitTime}ms before next batch`);
            await this.sleep(waitTime);
          }
          requestsThisMinute = 0;
        }

        // Add delay between requests to stay under 5/minute
        if (lastRequestTime > 0) {
          const timeSinceLastRequest = Date.now() - lastRequestTime;
          if (timeSinceLastRequest < REQUEST_DELAY) {
            await this.sleep(REQUEST_DELAY - timeSinceLastRequest);
          }
        }

        lastRequestTime = Date.now();
        requestsThisMinute++;

        const historicalPrices = await this.getHistoricalPrices(symbol, {
          startDate: startOfDay(forDate),
          endDate: endOfDay(forDate),
        });

        if (historicalPrices[0]) {
          const priceData = historicalPrices[0];
          fetchedPrices.push(priceData);
          logger.info(`Fetched price for ${symbol} on ${forDate.toISOString().split('T')[0]}: ${priceData.priceClose}`);
        } else {
          logger.warn(`No price data found for ${symbol} on ${forDate.toISOString().split('T')[0]}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to fetch price for ${symbol}: ${errorMessage}`);
        // Continue with next symbol instead of failing the entire batch
      }
    }

    logger.info(`Alpha Vantage fetch complete: ${fetchedPrices.length}/${symbolsToProcess.length} securities fetched`);
    return fetchedPrices;
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
