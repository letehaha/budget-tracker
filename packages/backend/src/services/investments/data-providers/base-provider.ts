import { ASSET_CLASS, SECURITY_PROVIDER, SecurityModel } from '@bt/shared/types/investments';

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

  abstract searchSecurities(query: string, limit?: number): Promise<SecuritySearchResult[]>;

  abstract getSecurityDetails(symbol: string): Promise<SecurityDetails | null>;

  abstract getHistoricalPrices(symbol: string, startDate: Date, endDate: Date): Promise<PriceData[]>;

  /**
   * Efficiently gets daily prices for a list of securities.
   * This is the primary method for daily price sync jobs.
   */
  abstract getDailyPrices(
    securities: Pick<SecurityModel, 'symbol' | 'assetClass' | 'currencyCode'>[],
    date: Date,
  ): Promise<PriceData[]>;
}
