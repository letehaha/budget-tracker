import { ASSET_CLASS, SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { sleep } from '@common/helpers';
import { logger } from '@js/utils';
import SecurityCurrencyCache from '@models/investments/security-currency-cache.model';
import { subYears } from 'date-fns';
import { Op } from 'sequelize';
import YahooFinance from 'yahoo-finance2';

import { BaseSecurityDataProvider, HistoricalPriceOptions, PriceData } from './base-provider';

const DEFAULT_HISTORY_YEARS = 5;
const CURRENCY_RESOLVE_CONCURRENCY = 5;

export class YahooDataProvider extends BaseSecurityDataProvider {
  readonly providerName = SECURITY_PROVIDER.yahoo;
  private client: InstanceType<typeof YahooFinance>;

  constructor() {
    super();
    this.client = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
  }

  public async searchSecurities(query: string): Promise<SecuritySearchResult[]> {
    try {
      logger.info(`Searching Yahoo Finance for: ${query}`);

      const searchResult = await this.client.search(query, { newsCount: 0 });
      const quotes = searchResult.quotes ?? [];

      if (quotes.length === 0) {
        logger.info(`No search results found for query: ${query}`);
        return [];
      }

      // Filter to only Yahoo Finance results with symbols
      const validQuotes = quotes.filter((q) => 'symbol' in q && !!q.symbol && q.isYahooFinance !== false);

      // Resolve currencies via 2-tier cache
      const symbols = validQuotes.map((q) => String(q.symbol));
      const currencyMap = await this.resolveCurrencies(symbols);

      const results: SecuritySearchResult[] = [];
      const droppedSymbols: string[] = [];

      for (const q of validQuotes) {
        const symbol = String(q.symbol);
        const currencyCode = currencyMap.get(symbol);
        if (!currencyCode) {
          droppedSymbols.push(symbol);
          continue;
        }

        const name =
          ('longname' in q ? String(q.longname) : undefined) ||
          ('shortname' in q ? String(q.shortname) : undefined) ||
          symbol;

        results.push({
          symbol,
          name,
          assetClass: this.mapTypeToAssetClass('typeDisp' in q ? String(q.typeDisp) : undefined),
          providerName: this.providerName,
          exchangeName: 'exchDisp' in q ? String(q.exchDisp) : undefined,
          exchangeAcronym: 'exchange' in q ? String(q.exchange) : undefined,
          exchangeMic: undefined,
          currencyCode,
          cusip: undefined,
          isin: undefined,
        });
      }

      if (droppedSymbols.length > 0) {
        logger.info(
          `Yahoo search: dropped ${droppedSymbols.length} symbols without currency: ${droppedSymbols.join(', ')}`,
        );
      }

      logger.info(`Yahoo search returned ${results.length} results for: ${query}`);
      return results;
    } catch (error) {
      logger.error({ message: 'Yahoo Finance search failed:', error: error as Error });
      throw new Error(`Yahoo Finance search failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        cause: error,
      });
    }
  }

  public async getLatestPrice(symbol: string): Promise<PriceData> {
    try {
      logger.info(`Fetching latest price from Yahoo for: ${symbol}`);

      const quote = await this.client.quote(symbol);

      if (!quote || !quote.regularMarketPreviousClose) {
        throw new Error(`No quote data found for symbol: ${symbol}`);
      }

      const priceClose = quote.regularMarketPreviousClose;
      if (!quote.regularMarketTime) {
        logger.info(`Missing regularMarketTime for ${symbol}, using current time as fallback`);
      }
      const marketTime = quote.regularMarketTime ? new Date(quote.regularMarketTime) : new Date();

      const result: PriceData = {
        symbol: quote.symbol ?? symbol,
        date: marketTime,
        priceClose,
        priceAsOf: marketTime,
        providerName: SECURITY_PROVIDER.yahoo,
      };

      logger.info(`Latest price for ${symbol}: ${priceClose} on ${marketTime.toISOString()}`);
      return result;
    } catch (error) {
      logger.error({ message: `Failed to fetch latest price for ${symbol}:`, error: error as Error });
      throw new Error(
        `Failed to fetch latest price for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  }

  public async getHistoricalPrices(symbol: string, options?: HistoricalPriceOptions): Promise<PriceData[]> {
    try {
      const startDate = options?.startDate;
      const endDate = options?.endDate;

      logger.info(
        `Fetching historical prices from Yahoo for: ${symbol}${startDate && endDate ? ` from ${startDate.toISOString()} to ${endDate.toISOString()}` : ' (full dataset)'}`,
      );

      const period1 = startDate ?? subYears(new Date(), DEFAULT_HISTORY_YEARS);
      const period2 = endDate ?? new Date();

      const chartResult = await this.client.chart(symbol, {
        period1: period1.toISOString().split('T')[0]!,
        period2: period2.toISOString().split('T')[0]!,
      });

      if (!chartResult.quotes || chartResult.quotes.length === 0) {
        throw new Error(`No historical data found for symbol: ${symbol}`);
      }

      const results: PriceData[] = [];
      for (const q of chartResult.quotes) {
        if (q.close == null) continue;

        results.push({
          symbol,
          date: new Date(q.date),
          priceClose: q.adjclose ?? q.close,
          priceAsOf: new Date(q.date),
          providerName: SECURITY_PROVIDER.yahoo,
        });
      }

      // Sort by date ascending
      const sorted = results.toSorted((a, b) => a.date.getTime() - b.date.getTime());

      logger.info(`Found ${sorted.length} historical prices for ${symbol}`);
      return sorted;
    } catch (error) {
      logger.error({ message: `Failed to fetch historical prices for ${symbol}:`, error: error as Error });
      throw new Error(
        `Failed to fetch historical prices for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  }

  public async fetchPricesForSecurities(symbols: string[], forDate: Date): Promise<PriceData[]> {
    if (symbols.length === 0) return [];

    logger.info(`Yahoo: Starting fetch for ${symbols.length} securities`);

    const fetchedPrices: PriceData[] = [];
    const REQUEST_DELAY = 150; // 150ms between requests to avoid throttling

    for (const symbol of symbols) {
      try {
        if (fetchedPrices.length > 0) {
          await sleep({ ms: REQUEST_DELAY });
        }

        // Use chart() with next day as period2 since Yahoo rejects same period1/period2
        const nextDay = new Date(forDate.getTime() + 24 * 60 * 60 * 1000);
        const prices = await this.getHistoricalPrices(symbol, { startDate: forDate, endDate: nextDay });
        if (prices[0]) {
          fetchedPrices.push(prices[0]);
          logger.info(`Fetched price for ${symbol} on ${forDate.toISOString().split('T')[0]}: ${prices[0].priceClose}`);
        } else {
          logger.info(`No price data found for ${symbol} on ${forDate.toISOString().split('T')[0]}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to fetch price for ${symbol}: ${errorMessage}`);
      }
    }

    logger.info(`Yahoo fetch complete: ${fetchedPrices.length}/${symbols.length} securities fetched`);
    return fetchedPrices;
  }

  /**
   * Resolves currencies for symbols using 2-tier strategy:
   * 1. Check SecurityCurrencyCache table first
   * 2. For uncached symbols, call Yahoo quote() API in batches and store results in cache
   */
  private async resolveCurrencies(symbols: string[]): Promise<Map<string, string>> {
    const currencyMap = new Map<string, string>();

    if (symbols.length === 0) return currencyMap;

    // Tier 1: Check cache
    try {
      const cached = await SecurityCurrencyCache.findAll({
        where: { symbol: { [Op.in]: symbols } },
        attributes: ['symbol', 'currencyCode'],
      });

      for (const entry of cached) {
        currencyMap.set(entry.symbol, entry.currencyCode);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.info(`Failed to read currency cache: ${errorMsg}. Proceeding with API calls`);
    }

    // Tier 2: Fetch uncached symbols from Yahoo API in batches
    const uncachedSymbols = symbols.filter((s) => !currencyMap.has(s));

    if (uncachedSymbols.length > 0) {
      const toCache: { symbol: string; currencyCode: string; providerName: SECURITY_PROVIDER }[] = [];

      // Process in batches to avoid overwhelming Yahoo API
      for (let i = 0; i < uncachedSymbols.length; i += CURRENCY_RESOLVE_CONCURRENCY) {
        const batch = uncachedSymbols.slice(i, i + CURRENCY_RESOLVE_CONCURRENCY);
        const quoteResults = await Promise.allSettled(batch.map((symbol) => this.client.quote(symbol)));

        for (let j = 0; j < batch.length; j++) {
          const result = quoteResults[j]!;
          const symbol = batch[j]!;

          if (result.status === 'fulfilled' && result.value?.currency) {
            currencyMap.set(symbol, result.value.currency);
            toCache.push({
              symbol,
              currencyCode: result.value.currency,
              providerName: SECURITY_PROVIDER.yahoo,
            });
          }
        }
      }

      // Store in cache (fire-and-forget, don't block the response)
      if (toCache.length > 0) {
        SecurityCurrencyCache.bulkCreate(toCache, { ignoreDuplicates: true }).catch((error) => {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.info(`Failed to store currency cache entries: ${errorMsg}`);
        });
      }
    }

    return currencyMap;
  }

  private mapTypeToAssetClass(typeDisp?: string): ASSET_CLASS {
    if (!typeDisp) return ASSET_CLASS.stocks;

    const type = typeDisp.toLowerCase();

    if (type === 'cryptocurrency') return ASSET_CLASS.crypto;
    if (type === 'option') return ASSET_CLASS.options;
    if (type === 'bond' || type === 'mutualfund') return ASSET_CLASS.fixed_income;

    // equity, etf, index, and others → stocks
    return ASSET_CLASS.stocks;
  }
}
