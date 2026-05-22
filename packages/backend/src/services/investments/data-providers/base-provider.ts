import type { ASSET_CLASS, SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';

/**
 * Represents normalized price data for a single security on a specific date.
 *
 * `symbol` here is the **provider-native identifier** (Yahoo ticker, CoinGecko
 * coin slug, etc.) — callers match it against `Security.providerSymbol` rather
 * than the human-facing ticker, because crypto symbols are not unique on
 * CoinGecko and a daily-sync map keyed on display symbol would miscount.
 */
export interface PriceData {
  symbol: string;
  date: Date;
  priceClose: number;
  priceAsOf?: Date;
  providerName: SECURITY_PROVIDER;
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
 * - `symbol` — human-facing ticker (e.g. "AAPL", "BTC").
 * - `providerSymbol` — provider-native id used in API calls. Equals `symbol`
 *   for stock providers; is the slug (e.g. "bitcoin") for CoinGecko. Required
 *   so leaf providers and the composite map can resolve the same coin under
 *   different display symbols.
 * - `assetClass` — lets the composite route by class and lets the closed-market
 *   check know that crypto trades 24/7.
 */
export interface SecurityPriceFetchInput {
  symbol: string;
  providerSymbol: string;
  assetClass: ASSET_CLASS;
}

export abstract class BaseSecurityDataProvider {
  abstract readonly providerName: SECURITY_PROVIDER;

  /**
   * Fetches the historical price data (OHLC) for a single security.
   * This is used for backfilling missing data or displaying charts.
   * Most providers return full available data by default.
   * @param symbol The ticker symbol of the security.
   * @param options Optional date range parameters. If not provided, returns all available data.
   * @returns A promise that resolves to an array of historical price data.
   */
  abstract getHistoricalPrices(symbol: string, options?: HistoricalPriceOptions): Promise<PriceData[]>;

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
   * @param symbol The ticker symbol of the security.
   * @returns A promise that resolves to the latest price data.
   */
  abstract getLatestPrice(symbol: string): Promise<PriceData>;

  /**
   * Fetch prices for multiple securities for a specific date.
   * This method only handles fetching and normalizing price data.
   * Database operations should be handled by the calling service.
   *
   * @param securities - Securities to fetch prices for (symbol + assetClass)
   * @param forDate - The date to fetch prices for
   * @returns Array of fetched price data
   */
  abstract fetchPricesForSecurities(securities: SecurityPriceFetchInput[], forDate: Date): Promise<PriceData[]>;

  // TODO: processSearchToSecurity method, because each security after search can provide different schema
  // and it should be processed uniquely when adding security from the search
}
