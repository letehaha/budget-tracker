import { ASSET_CLASS, SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';

import { BaseSecurityDataProvider, HistoricalPriceOptions, PriceData } from './base-provider';
import { FmpClient, FmpSearchResult } from './clients';

export class FmpDataProvider extends BaseSecurityDataProvider {
  readonly providerName = SECURITY_PROVIDER.fmp;
  private client: FmpClient;

  constructor(apiKey: string) {
    super();
    this.client = new FmpClient({ apiKey });
  }

  /**
   * Search for securities using FMP search endpoint
   */
  public async searchSecurities(query: string): Promise<SecuritySearchResult[]> {
    try {
      logger.info(`Searching FMP for: ${query}`);

      const searchResults = await this.client.search(query, 10);

      if (!Array.isArray(searchResults)) {
        logger.warn(`No search results found for query: ${query}`);
        return [];
      }

      const filteredSearch = searchResults.reduce(
        (acc, curr) => {
          if (curr.currency) {
            acc.with.push(curr);
          } else {
            acc.without.push(curr);
          }

          return acc;
        },
        { with: [] as FmpSearchResult[], without: [] as FmpSearchResult[] },
      );

      if (filteredSearch.without.length) {
        logger.warn('FMP search returned securities with no currency', { securities: filteredSearch.without, query });
      }

      const results: SecuritySearchResult[] = filteredSearch.with.map((result) => ({
        symbol: result.symbol,
        name: result.name,
        assetClass: this.mapToAssetClass(result.symbol),
        providerName: this.providerName,
        exchangeName: result.stockExchange,
        currencyCode: result.currency!, // cast ! cause we filtered out before
        exchangeAcronym: result.exchangeShortName,
        exchangeMic: undefined,
        cusip: undefined,
        isin: undefined,
      }));

      return results;
    } catch (error) {
      logger.error({ message: 'FMP search failed:', error: error as Error });
      throw new Error(`FMP search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get latest price for a security
   */
  public async getLatestPrice(symbol: string): Promise<PriceData> {
    try {
      logger.info(`Fetching latest price for: ${symbol}`);

      const quotes = await this.client.getQuote(symbol);

      if (!Array.isArray(quotes) || quotes.length === 0) {
        throw new Error(`No quote data found for symbol: ${symbol}`);
      }

      const quote = quotes[0]!;
      const priceClose = quote.previousClose;
      const latestTradingDay = new Date(quote.timestamp * 1000);

      const result: PriceData = {
        symbol: quote.symbol,
        date: latestTradingDay,
        priceClose,
        priceAsOf: latestTradingDay, // Price is as of the previous close date
        providerName: SECURITY_PROVIDER.fmp,
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

      // If no date range specified, FMP typically returns recent data by default
      const fromDate = startDate?.toISOString().split('T')[0];
      const toDate = endDate?.toISOString().split('T')[0];

      const historicalResponse = await this.client.getHistoricalPrices(symbol, fromDate, toDate);

      if (!historicalResponse.historical || !Array.isArray(historicalResponse.historical)) {
        throw new Error(`No historical data found for symbol: ${symbol}`);
      }

      const results: PriceData[] = historicalResponse.historical.map((dailyData) => ({
        symbol,
        date: new Date(dailyData.date),
        priceClose: dailyData.price,
        priceAsOf: new Date(dailyData.date),
        providerName: SECURITY_PROVIDER.fmp,
      }));

      // Sort by date ascending
      results.sort((a, b) => a.date.getTime() - b.date.getTime());

      logger.info(`Found ${results.length} historical prices for ${symbol} in date range`);
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
   * FMP free tier has 250 requests/day limit.
   * Paid tiers have much higher limits (300-3000 requests/minute).
   */
  public async fetchPricesForSecurities(symbols: string[], forDate: Date): Promise<PriceData[]> {
    const FMP_FREE_DAILY_LIMIT = 250;
    const FMP_MINUTE_LIMIT = 5; // Conservative limit for free tier
    const MINUTE_DELAY = 60 * 1000 + 1000; // 61 seconds to be safe
    const REQUEST_DELAY = 12 * 1000; // 12 seconds between requests for free tier

    if (symbols.length === 0) {
      return [];
    }

    logger.info(`FMP: Starting fetch for ${symbols.length} securities`);

    // Apply daily limit
    const symbolsToProcess = symbols.length > FMP_FREE_DAILY_LIMIT ? symbols.slice(0, FMP_FREE_DAILY_LIMIT) : symbols;

    if (symbolsToProcess.length < symbols.length) {
      logger.warn(`FMP daily limit reached: processing ${symbolsToProcess.length} of ${symbols.length} securities`);
    }

    const fetchedPrices: PriceData[] = [];
    let requestsThisMinute = 0;
    let lastRequestTime = 0;

    for (const symbol of symbolsToProcess) {
      try {
        // Rate limiting: respect free tier limits
        if (requestsThisMinute >= FMP_MINUTE_LIMIT) {
          const timeSinceLastRequest = Date.now() - lastRequestTime;
          if (timeSinceLastRequest < MINUTE_DELAY) {
            const waitTime = MINUTE_DELAY - timeSinceLastRequest;
            logger.info(`FMP rate limit: waiting ${waitTime}ms before next batch`);
            await this.sleep(waitTime);
          }
          requestsThisMinute = 0;
        }

        // Add delay between requests
        if (lastRequestTime > 0) {
          const timeSinceLastRequest = Date.now() - lastRequestTime;
          if (timeSinceLastRequest < REQUEST_DELAY) {
            await this.sleep(REQUEST_DELAY - timeSinceLastRequest);
          }
        }

        // Fetch price for specific date using historical data
        lastRequestTime = Date.now();
        requestsThisMinute++;

        const historicalPrices = await this.getHistoricalPrices(symbol, { startDate: forDate, endDate: forDate });
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

    logger.info(`FMP fetch complete: ${fetchedPrices.length}/${symbolsToProcess.length} securities fetched`);
    return fetchedPrices;
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Map symbol patterns to our internal ASSET_CLASS enum
   * FMP doesn't provide asset class in search, so we'll infer from symbol patterns
   */
  private mapToAssetClass(symbol: string): ASSET_CLASS {
    const symbolUpper = symbol.toUpperCase();

    // Crypto patterns
    if (symbolUpper.includes('BTC') || symbolUpper.includes('ETH') || symbolUpper.includes('CRYPTO')) {
      return ASSET_CLASS.crypto;
    }

    // ETF patterns (common ETF suffixes)
    if (symbolUpper.endsWith('ETF') || symbolUpper.match(/^[A-Z]{3,4}$/)) {
      return ASSET_CLASS.stocks; // Treat ETFs as stocks
    }

    // Default to stocks for most symbols
    return ASSET_CLASS.stocks;
  }
}
