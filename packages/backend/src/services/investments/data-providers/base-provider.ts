import type { ASSET_CLASS, SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';

/**
 * Branded type for provider-native security identifiers (Yahoo/Polygon/FMP/
 * AlphaVantage ticker, CoinGecko coin slug). Prevents accidental assignment
 * of `Security.symbol` (display ticker) where a provider-native id is required —
 * the two are NOT interchangeable for CoinGecko (`"BTC"` vs `"bitcoin"`), and
 * the price-sync map relies on matching against the provider-native id.
 *
 * Cast at the boundary (DB row → call site, or external API response →
 * `PriceData`) via {@link toProviderSymbol}.
 */
export type ProviderSymbol = string & { readonly __brand: 'ProviderSymbol' };

/**
 * Boundary cast from a plain string (Security row field, external SDK response)
 * into a {@link ProviderSymbol}. Caller is asserting the string is the
 * provider-native id, not the display ticker.
 */
export const toProviderSymbol = (value: string): ProviderSymbol => value as ProviderSymbol;

/**
 * Represents normalized price data for a single security on a specific date.
 * Returned by single-security methods (`getLatestPrice`, `getHistoricalPrices`)
 * where the caller already knows which Security it asked for. For bulk fetches
 * see {@link BulkPriceData}, which carries the originating `securityId`.
 *
 * `providerSymbol` is the provider-native identifier (Yahoo ticker, CoinGecko
 * coin slug, etc.).
 */
export interface PriceData {
  providerSymbol: ProviderSymbol;
  date: Date;
  priceClose: number;
  /**
   * The moment the upstream provider reports the price was valid. Always set
   * by every leaf provider — required so the daily/intraday sync can use it as
   * the stored row's timestamp without a fallback that would silently break
   * `(securityId, date)` dedup across runs.
   */
  priceAsOf: Date;
  providerName: SECURITY_PROVIDER;
}

/**
 * A {@link PriceData} that carries the caller's `securityId` echoed from the
 * matching {@link SecurityPriceFetchInput}. Returned by
 * {@link BaseSecurityDataProvider.fetchPricesForSecurities}.
 *
 * Threading `securityId` through avoids matching by `(providerName,
 * providerSymbol)` — that pair can collide across the DB (two Securities
 * sharing a symbol under different providers) and also breaks under the
 * composite's fallback path (intended provider ≠ actual fetcher).
 */
export interface BulkPriceData extends PriceData {
  securityId: string;
}

/**
 * Optional refinements for a security search. Currently just an asset-class
 * filter coming from the UI pill-tab (All / Stocks / Crypto). When set, the
 * composite provider can skip provider calls that would only return rows of
 * the wrong class — and as a defense-in-depth measure callers should still
 * filter results, since some providers (Yahoo) return mixed-class hits.
 */
export interface SearchOptions {
  assetClass?: ASSET_CLASS;
}

export interface HistoricalPriceOptions {
  startDate?: Date;
  endDate?: Date;
  /**
   * Asset class for routing in the composite provider. When set to `crypto`,
   * the composite delegates to CoinGecko regardless of symbol shape.
   */
  assetClass?: ASSET_CLASS;
}

/**
 * Minimal info needed to fetch a price for a security.
 *
 * - `securityId` — opaque caller-supplied identifier (the Securities row UUID).
 *   Threaded through to each returned `PriceData.securityId` so callers can
 *   resolve outputs back to inputs without string-matching on
 *   `(providerName, providerSymbol)`. Required because that pair can collide
 *   across the DB and isn't preserved through the composite's fallback path.
 * - `symbol` — human-facing ticker (e.g. "AAPL", "BTC").
 * - `providerSymbol` — provider-native id used in API calls. Equals `symbol`
 *   for stock providers; is the slug (e.g. "bitcoin") for CoinGecko. Required
 *   so leaf providers and the composite map can resolve the same coin under
 *   different display symbols.
 * - `assetClass` — lets the composite route by class and lets the closed-market
 *   check know that crypto trades 24/7.
 */
export interface SecurityPriceFetchInput {
  securityId: string;
  symbol: string;
  providerSymbol: ProviderSymbol;
  assetClass: ASSET_CLASS;
}

export abstract class BaseSecurityDataProvider {
  abstract readonly providerName: SECURITY_PROVIDER;

  /**
   * Fetches the historical price data (OHLC) for a single security.
   * This is used for backfilling missing data or displaying charts.
   * Most providers return full available data by default.
   * @param providerSymbol The provider-native identifier of the security.
   * @param options Optional date range parameters. If not provided, returns all available data.
   * @returns A promise that resolves to an array of historical price data.
   */
  abstract getHistoricalPrices(providerSymbol: ProviderSymbol, options?: HistoricalPriceOptions): Promise<PriceData[]>;

  /**
   * Searches for securities based on a query string (symbol or name).
   * Composite implementations may use `options.assetClass` to skip providers
   * that aren't relevant for the requested class; leaf providers can ignore it.
   * @param query The search term (partial symbol or company name).
   * @param options Optional refinements (e.g. asset-class filter from the UI).
   * @returns A promise that resolves to an array of matching securities.
   */
  abstract searchSecurities(query: string, options?: SearchOptions): Promise<SecuritySearchResult[]>;

  /**
   * Fetches the latest/current price for a single security.
   * This is used for immediate price display and current portfolio valuation.
   * @param providerSymbol The provider-native identifier of the security.
   * @returns A promise that resolves to the latest price data.
   */
  abstract getLatestPrice(providerSymbol: ProviderSymbol): Promise<PriceData>;

  /**
   * Fetch prices for multiple securities for a specific date. This method only
   * handles fetching and normalizing price data; database operations should be
   * handled by the calling service.
   *
   * Returns a `Map<securityId, BulkPriceData>` so the caller can look results
   * up by the same UUID it supplied without doing its own re-join. Securities
   * that did not produce a price (delisted, market closed, provider error)
   * are simply absent from the map — callers should diff input ids against
   * map keys to detect partial failures.
   *
   * @param securities - Securities to fetch prices for
   * @param forDate - The date to fetch prices for
   * @returns Map keyed by `securityId` containing successfully fetched prices.
   */
  abstract fetchPricesForSecurities(
    securities: SecurityPriceFetchInput[],
    forDate: Date,
  ): Promise<Map<string, BulkPriceData>>;

  // TODO: processSearchToSecurity method, because each security after search can provide different schema
  // and it should be processed uniquely when adding security from the search

  /**
   * Logs the error and returns a new Error wrapping it with the operation
   * description, so leaf provider methods can `throw this.formatProviderError(...)`
   * from a catch branch instead of repeating the same log + Error.cause boilerplate.
   * The wrapped Error preserves the original via `cause` so upstream
   * (composite provider, callers) can still inspect the underlying failure.
   */
  protected formatProviderError({ operation, error }: { operation: string; error: unknown }): Error {
    logger.error({ message: `${operation}:`, error: error as Error });
    return new Error(`${operation}: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      cause: error,
    });
  }
}
