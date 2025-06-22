import type { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';

/**
 * Represents the normalized result of a security search from a data provider.
 */
export interface SecuritySearchResult {
  symbol: string;
  name: string;
  assetClass: ASSET_CLASS;
  providerName: SECURITY_PROVIDER; // The provider that sourced this security data.
  exchangeAcronym?: string;
  exchangeMic?: string;
  exchangeName?: string;
  currencyCode: string;
  cusip?: string;
  isin?: string;
}

/**
 * Represents normalized price data for a single security on a specific date.
 */
export interface PriceData {
  symbol: string;
  date: Date;
  priceClose: number;
  priceAsOf?: Date;
}

export interface SecurityDetails extends SecuritySearchResult {
  sharesPerContract?: string;
  cryptoCurrencyCode?: string;
}

export abstract class BaseSecurityDataProvider {
  abstract readonly providerName: SECURITY_PROVIDER;

  /**
   * Fetches all available securities from the provider for bulk synchronization.
   * This method is responsible for handling provider-specific pagination and
   * normalizing the data into the generic SecuritySearchResult format.
   */
  abstract getAllSecurities(): Promise<SecuritySearchResult[]>;

  /**
   * Fetches the daily closing prices for all available tickers for a single, specific date.
   * This is the primary method for the daily price sync cron job.
   * @param date The target date for which to fetch prices.
   * @returns A promise that resolves to an array of price data for all securities.
   */
  abstract getDailyPrices(date: Date): Promise<PriceData[]>;

  /**
   * Fetches the historical price data (OHLC) for a single security over a specified date range.
   * This is used for backfilling missing data or displaying charts.
   * @param symbol The ticker symbol of the security.
   * @param startDate The beginning of the date range.
   * @param endDate The end of the date range.
   * @returns A promise that resolves to an array of historical price data.
   */
  abstract getHistoricalPrices(symbol: string, startDate: Date, endDate: Date): Promise<PriceData[]>;
}
