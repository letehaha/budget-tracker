import type { SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';

/**
 * Represents normalized price data for a single security on a specific date.
 */
export interface PriceData {
  symbol: string;
  date: Date;
  priceClose: number;
  priceAsOf?: Date;
  providerName: SECURITY_PROVIDER | undefined; // Provider that fetched this data (useful for composite providers)
}

export interface HistoricalPriceOptions {
  startDate?: Date;
  endDate?: Date;
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
   * This is used for real-time security search in the UI.
   * @param query The search term (partial symbol or company name).
   * @returns A promise that resolves to an array of matching securities.
   */
  abstract searchSecurities(query: string): Promise<SecuritySearchResult[]>;

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
   * @param symbols - Array of security symbols to fetch prices for
   * @param forDate - The date to fetch prices for
   * @returns Array of fetched price data
   */
  abstract fetchPricesForSecurities(symbols: string[], forDate: Date): Promise<PriceData[]>;

  // TODO: processSearchToSecurity method, because each security after search can provide different schema
  // and it should be processed uniquely when adding security from the search
}
