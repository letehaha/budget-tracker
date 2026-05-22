import { ASSET_CLASS, SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import Coingecko from '@coingecko/coingecko-typescript';
import { logger } from '@js/utils';
import { subYears } from 'date-fns';

import { BaseSecurityDataProvider, HistoricalPriceOptions, PriceData, SecurityPriceFetchInput } from './base-provider';

/**
 * CoinGecko Demo tier serves at most 1 year of daily/hourly history (5-minutely
 * is capped at 1 day). Backfill callers may request a wider range, but we clamp
 * here so we don't return an empty array on the boundary. To extend beyond 1y
 * we'd need a second source (CryptoCompare, Binance klines) or a paid plan.
 */
const DEMO_MAX_HISTORY_YEARS = 1;
/** /simple/price accepts up to ~500 ids per call. Stay well under the cap. */
const SIMPLE_PRICE_BATCH_SIZE = 250;
/** Cap exact-symbol matches returned to the UI. */
const SEARCH_EXACT_LIMIT = 5;
/** Cap partial (substring) matches returned to the UI. */
const SEARCH_PARTIAL_LIMIT = 10;

/**
 * Names of "derivative" tokens (wrapped / bridged / staked / pegged /
 * synthetic copies of an underlying asset). They track the underlying
 * asset's price but are separate tokens and overwhelmingly confuse users
 * who are searching for the real underlying: e.g. searching "BTC" returns
 * "NEAR Intents Bridged BTC", or searching "NEAR" returns
 * "Binance-Peg NEAR" / "Wrapped Near" / "Staked NEAR". We drop them at
 * the search layer so the result list stays focused on the canonical
 * coin per ticker.
 *
 * `\b` ensures we don't false-positive on legitimate project names that
 * happen to start with one of these prefixes (e.g. "Synthetix" is not
 * matched by `\bsynthetic\b`).
 */
const DERIVATIVE_TOKEN_NAME_PATTERN = /\b(wrapped|bridged|staked|peg(ged)?|synthetic)\b/i;

const isDerivativeToken = (coin: { name?: string | null }): boolean =>
  coin.name ? DERIVATIVE_TOKEN_NAME_PATTERN.test(coin.name) : false;

const compareByMarketCapRank = (a: { market_cap_rank?: number }, b: { market_cap_rank?: number }) =>
  (a.market_cap_rank ?? Number.POSITIVE_INFINITY) - (b.market_cap_rank ?? Number.POSITIVE_INFINITY);

export class CoinGeckoDataProvider extends BaseSecurityDataProvider {
  readonly providerName = SECURITY_PROVIDER.coingecko;
  private client: Coingecko;

  constructor({ apiKey }: { apiKey: string }) {
    super();
    this.client = new Coingecko({ demoAPIKey: apiKey, environment: 'demo' });
  }

  /**
   * CoinGecko's `/search` returns coins ranked by market cap. We split the
   * response into "exact symbol match" and "partial" buckets and cap each so
   * the UI gets a small, ranked list rather than a long tail of scam tokens
   * that happen to share a ticker (e.g. dozens of coins symboled "BTC").
   */
  public async searchSecurities(query: string): Promise<SecuritySearchResult[]> {
    if (!query.trim()) return [];

    try {
      logger.info(`Searching CoinGecko for: ${query}`);
      const response = await this.client.search.get({ query });
      const coins = (response.coins ?? []).filter((c) => !!c.id && !!c.symbol);

      // Strip derivative tokens (wrapped/bridged/staked/peg/synthetic). See
      // DERIVATIVE_TOKEN_NAME_PATTERN above for rationale.
      const realCoins = coins.filter((c) => !isDerivativeToken(c));

      const upperQuery = query.trim().toUpperCase();
      const exact: typeof realCoins = [];
      const partial: typeof realCoins = [];

      for (const coin of realCoins) {
        if ((coin.symbol ?? '').toUpperCase() === upperQuery) {
          exact.push(coin);
        } else {
          partial.push(coin);
        }
      }

      // Exact-symbol matches are kept even when market_cap_rank is null —
      // covers the rare case of a niche coin whose ticker the user typed
      // verbatim.
      const limitedExact = exact.toSorted(compareByMarketCapRank).slice(0, SEARCH_EXACT_LIMIT);
      // Partial matches without a market_cap_rank are overwhelmingly dust /
      // inactive coins CoinGecko surfaces because the query happened to match
      // somewhere in their name. Dropping them keeps the partial list focused
      // on coins with real liquidity.
      const limitedPartial = partial
        .filter((c) => c.market_cap_rank != null)
        .toSorted(compareByMarketCapRank)
        .slice(0, SEARCH_PARTIAL_LIMIT);

      const mapCoin = (coin: (typeof coins)[number], matchType: 'exact' | 'partial'): SecuritySearchResult => {
        const symbolUpper = (coin.symbol ?? '').toUpperCase();
        return {
          symbol: symbolUpper,
          providerSymbol: coin.id!,
          name: coin.name ?? symbolUpper,
          assetClass: ASSET_CLASS.crypto,
          providerName: this.providerName,
          // CoinGecko itself isn't an exchange, but the UI expects a label.
          exchangeName: 'CoinGecko',
          exchangeAcronym: undefined,
          exchangeMic: undefined,
          // All prices are stored in USD; the existing ref-currency conversion
          // pipeline handles user-display currency.
          currencyCode: 'USD',
          cryptoCurrencyCode: symbolUpper,
          cusip: undefined,
          isin: undefined,
          matchType,
          marketCapRank: coin.market_cap_rank ?? null,
        };
      };

      return [...limitedExact.map((c) => mapCoin(c, 'exact')), ...limitedPartial.map((c) => mapCoin(c, 'partial'))];
    } catch (error) {
      logger.error({ message: `CoinGecko search failed for "${query}"`, error: error as Error });
      // Match the soft-failure pattern of other providers' search paths.
      return [];
    }
  }

  public async getLatestPrice(providerSymbol: string): Promise<PriceData> {
    try {
      logger.info(`Fetching latest CoinGecko price for: ${providerSymbol}`);
      const response = await this.client.simple.price.get({
        ids: providerSymbol,
        vs_currencies: 'usd',
        include_last_updated_at: true,
      });

      const entry = response[providerSymbol];
      if (!entry || entry.usd == null) {
        throw new Error(`No price data returned for ${providerSymbol}`);
      }

      const priceAsOf = entry.last_updated_at ? new Date(entry.last_updated_at * 1000) : new Date();

      return {
        symbol: providerSymbol,
        date: priceAsOf,
        priceClose: entry.usd,
        priceAsOf,
        providerName: SECURITY_PROVIDER.coingecko,
      };
    } catch (error) {
      logger.error({ message: `Failed to fetch CoinGecko price for ${providerSymbol}`, error: error as Error });
      throw new Error(
        `Failed to fetch CoinGecko price for ${providerSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  }

  public async getHistoricalPrices(providerSymbol: string, options?: HistoricalPriceOptions): Promise<PriceData[]> {
    try {
      const endDate = options?.endDate ?? new Date();
      const requestedStart = options?.startDate ?? subYears(endDate, DEMO_MAX_HISTORY_YEARS);
      // Clamp to Demo tier's 1-year window so the API doesn't 401.
      const demoCutoff = subYears(endDate, DEMO_MAX_HISTORY_YEARS);
      const startDate = requestedStart < demoCutoff ? demoCutoff : requestedStart;
      if (requestedStart < demoCutoff) {
        // Operators need to know history is being silently truncated — otherwise a
        // user-visible "no chart data before X" looks like missing data, not a tier cap.
        logger.warn(
          `CoinGecko history for ${providerSymbol} clamped to ${DEMO_MAX_HISTORY_YEARS}y (requested start ${requestedStart.toISOString()}, served from ${demoCutoff.toISOString()}). Demo tier limit.`,
        );
      }

      if (startDate >= endDate) return [];

      logger.info(
        `Fetching CoinGecko historical prices for ${providerSymbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
      );

      const response = await this.client.coins.marketChart.getRange(providerSymbol, {
        vs_currency: 'usd',
        from: String(Math.floor(startDate.getTime() / 1000)),
        to: String(Math.floor(endDate.getTime() / 1000)),
      });

      const prices = response.prices ?? [];
      return prices
        .filter((pair): pair is [number, number] => Array.isArray(pair) && pair.length === 2 && pair[1] != null)
        .map(([ts, price]) => {
          const date = new Date(ts);
          return {
            symbol: providerSymbol,
            date,
            priceClose: price,
            priceAsOf: date,
            providerName: SECURITY_PROVIDER.coingecko,
          };
        });
    } catch (error) {
      logger.error({
        message: `Failed to fetch CoinGecko historical prices for ${providerSymbol}`,
        error: error as Error,
      });
      throw new Error(
        `Failed to fetch CoinGecko historical prices for ${providerSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error },
      );
    }
  }

  /**
   * Batch latest-price fetch via `/simple/price?ids=…`. PriceData.symbol is set
   * to the CoinGecko `providerSymbol` (slug) so the daily-sync map — keyed on
   * `Security.providerSymbol` — can resolve the row back. Display ticker is
   * NEVER used for matching here because crypto tickers aren't unique.
   */
  public async fetchPricesForSecurities(securities: SecurityPriceFetchInput[], forDate: Date): Promise<PriceData[]> {
    if (securities.length === 0) return [];

    const cryptoOnly = securities.filter((s) => s.assetClass === ASSET_CLASS.crypto);
    if (cryptoOnly.length === 0) return [];

    logger.info(`CoinGecko: fetching latest prices for ${cryptoOnly.length} coins`);

    const results: PriceData[] = [];
    for (let i = 0; i < cryptoOnly.length; i += SIMPLE_PRICE_BATCH_SIZE) {
      const batch = cryptoOnly.slice(i, i + SIMPLE_PRICE_BATCH_SIZE);
      const ids = batch.map((s) => s.providerSymbol).join(',');

      try {
        const response = await this.client.simple.price.get({
          ids,
          vs_currencies: 'usd',
          include_last_updated_at: true,
        });

        for (const [id, entry] of Object.entries(response)) {
          if (!entry || entry.usd == null) {
            // CoinGecko returned the coin in the batch but with no USD price (delisted,
            // partial response, transient error). Surface it so operators can see the gap.
            logger.warn(`CoinGecko returned no USD price for ${id} in batch fetch`);
            continue;
          }
          const priceAsOf = entry.last_updated_at ? new Date(entry.last_updated_at * 1000) : forDate;
          results.push({
            symbol: id,
            date: forDate,
            priceClose: entry.usd,
            priceAsOf,
            providerName: SECURITY_PROVIDER.coingecko,
          });
        }
      } catch (error) {
        // Per-batch failures are non-fatal — the composite still merges what other
        // batches returned — but they MUST be visible in Sentry. Auth failures, rate
        // limits, and 5xx all surface here; logging at `info` would hide them.
        logger.error({
          message: `CoinGecko batch fetch failed (batch ${i / SIMPLE_PRICE_BATCH_SIZE + 1}/${Math.ceil(cryptoOnly.length / SIMPLE_PRICE_BATCH_SIZE)})`,
          error: error as Error,
        });
      }
    }

    logger.info(`CoinGecko fetch complete: ${results.length}/${cryptoOnly.length} prices fetched`);
    return results;
  }
}
