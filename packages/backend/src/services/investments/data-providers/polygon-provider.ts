import { ASSET_CLASS, SECURITY_PROVIDER, SecurityModel } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import * as requestsUtils from '@js/utils/requests-calling.utils';
import {
  type IAggs,
  type IAggsGroupedDaily,
  type IRestClient,
  type ITickers,
  type ITickersQuery,
  restClient,
} from '@polygon.io/client-js';
import { format } from 'date-fns';
import { promises as fs } from 'fs';
import path from 'path';

import { BaseSecurityDataProvider, PriceData, SecurityDetails, SecuritySearchResult } from './base-provider';

// Since the library doesn't export these types directly, we derive them.
type ITickersResults = NonNullable<ITickers['results']>[number];
type IAggsResults = NonNullable<IAggs['results']>[number];
type TickerTypes = ITickersQuery['type'];

// Helper to format tickers correctly based on asset class
function getPolygonTicker(security: Pick<SecurityModel, 'assetClass' | 'currencyCode' | 'symbol'>): string | null {
  if (!security.symbol) return null;

  switch (security.assetClass) {
    case ASSET_CLASS.options:
      return `O:${security.symbol}`;
    case ASSET_CLASS.crypto:
      return `X:${security.symbol}${security.currencyCode}`;
    case ASSET_CLASS.cash:
      return security.symbol === security.currencyCode ? null : `C:${security.symbol}${security.currencyCode}`;
    case ASSET_CLASS.stocks:
    default:
      return security.symbol;
  }
}

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

  async syncAllUSTickers(): Promise<SecuritySearchResult[]> {
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

  async searchSecurities(query: string, limit = 10): Promise<SecuritySearchResult[]> {
    const response: ITickers = await this.client.reference.tickers({
      search: query,
      limit,
      active: 'true',
    });

    return (
      response.results?.map((ticker: ITickersResults) => ({
        symbol: ticker.ticker,
        name: ticker.name,
        providerName: SECURITY_PROVIDER.polygon,
        assetClass: this.mapAssetClass(ticker.type as TickerTypes),
        currencyCode: ticker.currency_name || 'USD',
        exchangeAcronym: ticker.primary_exchange,
      })) || []
    );
  }

  async getSecurityDetails(symbol: string): Promise<SecurityDetails | null> {
    const response = await this.client.reference.tickerDetails(symbol);
    const ticker = response.results;

    if (!ticker) return null;

    return {
      symbol: ticker.ticker!,
      name: ticker.name!,
      providerName: SECURITY_PROVIDER.polygon,
      assetClass: this.mapAssetClass(ticker.type as TickerTypes),
      currencyCode: ticker.currency_name || 'USD',
      exchangeAcronym: ticker.primary_exchange,
      sharesPerContract: ticker.share_class_shares_outstanding?.toString(),
    };
  }

  async getDailyPrices(
    securities: Pick<SecurityModel, 'symbol' | 'assetClass' | 'currencyCode'>[],
    date: Date,
  ): Promise<PriceData[]> {
    const dateStr = format(date, 'yyyy-MM-dd');
    logger.info(`Fetching all daily pricing for ${dateStr} from Polygon.`);

    const allPricing: IAggsGroupedDaily = await requestsUtils.withRetry(() =>
      this.client.stocks.aggregatesGroupedDaily(dateStr, { adjusted: 'true' }),
    );

    if (!allPricing.results) return [];

    const pricesMap = new Map<string, IAggsResults>();
    for (const price of allPricing.results) {
      if (price.T) {
        pricesMap.set(price.T, price);
      }
    }

    const results: PriceData[] = [];
    for (const security of securities) {
      const ticker = getPolygonTicker(security);
      if (ticker && pricesMap.has(ticker)) {
        const priceInfo = pricesMap.get(ticker)!;
        if (priceInfo.c && priceInfo.t) {
          results.push({
            symbol: security.symbol!,
            date: new Date(priceInfo.t),
            priceClose: priceInfo.c,
          });
        }
      }
    }
    return results;
  }

  async getHistoricalPrices(symbol: string, startDate: Date, endDate: Date): Promise<PriceData[]> {
    const response: IAggs = await this.client.stocks.aggregates(
      symbol,
      1,
      'day',
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd'),
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
