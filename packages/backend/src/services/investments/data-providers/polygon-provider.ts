import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
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
import { promises as fs } from 'fs';
import path from 'path';

import { BaseSecurityDataProvider, PriceData, SecuritySearchResult } from './base-provider';

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

  /**
   * Implements the generic interface method for fetching all securities.
   * Internally, it calls the Polygon-specific logic for US tickers.
   */
  public async getAllSecurities(): Promise<SecuritySearchResult[]> {
    const rawTickers = await this.syncAllUSTickers();
    logger.info(`Fetched ${rawTickers.length} raw tickers from Polygon.`);

    return rawTickers;
  }

  private async syncAllUSTickers(): Promise<SecuritySearchResult[]> {
    logger.info('Started fetching exchanges');
    const exchanges = (
      await this.client.reference.exchanges({
        locale: 'us',
        asset_class: 'stocks',
      })
    ).results?.filter((ex) => ex.type === 'exchange');

    logger.info(`Exchanges loaded. Amount: ${exchanges.length}`);

    if (!exchanges) return [];

    try {
      const dataDir = path.join(process.cwd(), 'data');
      const exchangesPath = path.join(dataDir, 'exchanges.json');
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(exchangesPath, JSON.stringify(exchanges, null, 2));
      logger.info(`Successfully wrote ${exchanges.length} exchanges to data/exchanges.json`);
    } catch (error) {
      logger.error({ message: 'Failed to write exchanges.json', error: error as Error });
      // Continue even if file writing fails
    }

    let allTickers: SecuritySearchResult[] = [];

    for (const exchange of exchanges) {
      if (!exchange.mic) continue;

      try {
        const exchangeTickers = await requestsUtils.paginateWithNextUrl({
          pageSize: 1000,
          delay: {
            onDelay: (msg: string) => logger.info(msg),
            milliseconds: this.reateLimitDelay,
          },
          fetchData: async (limit, nextCursor) => {
            try {
              console.log(`loop over: ${exchange.name}, ${exchange.mic}`);
              const { results, next_url } = await requestsUtils.withRetry(
                () =>
                  this.client.reference.tickers({
                    market: 'stocks',
                    exchange: exchange.mic,
                    cursor: nextCursor,
                    limit: limit,
                  }),
                {
                  maxRetries: 5,
                  delay: this.reateLimitDelay,
                },
              );

              // Normalize the raw, provider-specific data into our generic format here.
              const tickersWithExchange = results.map((ticker) => ({
                symbol: ticker.ticker,
                name: ticker.name,
                providerName: SECURITY_PROVIDER.polygon,
                assetClass: this.mapAssetClass(ticker.type as TickerTypes),
                currencyCode: ticker.currency_name || 'USD',
                exchangeMic: exchange.mic,
                exchangeAcronym: exchange.acronymstring ?? '',
                exchangeName: exchange.name,
              }));
              return { data: tickersWithExchange, nextUrl: next_url };
            } catch (err) {
              logger.error({ message: 'Error while fetching tickers', error: err as Error });

              return { data: [], nextUrl: undefined };
            }
          },
        });
        allTickers = allTickers.concat(exchangeTickers);
      } catch (err) {
        logger.error(err as Error);
        throw err;
      }
    }

    try {
      const tickersPath = path.join(process.cwd(), 'data', 'tickers.json');
      await fs.writeFile(tickersPath, JSON.stringify(allTickers, null, 2));
      logger.info(`Successfully wrote ${allTickers.length} tickers to data/tickers.json`);
    } catch (error) {
      logger.error({ message: 'Failed to write tickers.json', error: error as Error });
      // Continue even if file writing fails
    }

    return allTickers;
  }

  // https://polygon.io/docs/rest/stocks/aggregates/daily-market-summary
  public async getDailyPrices(date: Date): Promise<PriceData[]> {
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
