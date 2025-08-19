import { logger } from '@js/utils';

export class FmpClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: FmpClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = 'https://financialmodelingprep.com';
  }

  /**
   * Search for securities by symbol
   */
  public async search(query: string, limit: number = 10): Promise<FmpSearchResult[]> {
    const url = this.buildUrl('/search-symbol', { query, limit });
    return this.makeRequest<FmpSearchResult[]>(url);
  }

  /**
   * Get real-time quote for a symbol
   */
  public async getQuote(symbol: string): Promise<FmpQuote[]> {
    const url = this.buildUrl('/quote', { symbol });
    return this.makeRequest<FmpQuote[]>(url);
  }

  /**
   * Get historical price data for a symbol (light version - only close price and volume)
   */
  public async getHistoricalPrices(
    symbol: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<FmpHistoricalLightResponse> {
    const params: Record<string, string> = { symbol };

    if (fromDate) {
      params.from = fromDate;
    }
    if (toDate) {
      params.to = toDate;
    }

    const url = this.buildUrl('/historical-price-eod/light', params);
    return this.makeRequest<FmpHistoricalLightResponse>(url);
  }

  /**
   * Get full historical price data for a symbol (includes OHLC, volume, etc.)
   */
  public async getHistoricalPricesFull(
    symbol: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<FmpHistoricalResponse> {
    const params: Record<string, string> = { symbol };

    if (fromDate) {
      params.from = fromDate;
    }
    if (toDate) {
      params.to = toDate;
    }

    const url = this.buildUrl('/historical-price-eod/full', params);
    return this.makeRequest<FmpHistoricalResponse>(url);
  }

  // /**
  //  * Get quote for multiple symbols (comma-separated)
  //  */
  // public async getMultipleQuotes(symbols: string[]): Promise<FmpQuote[]> {
  //   const symbolsStr = symbols.join(',');
  //   const url = this.buildUrl('/quote', { symbol: symbolsStr });
  //   return this.makeRequest<FmpQuote[]>(url);
  // }

  // /**
  //  * Search for securities by company name
  //  */
  // public async searchByName(query: string, limit: number = 10): Promise<FmpSearchResult[]> {
  //   const url = this.buildUrl('/search-name', { query, limit });
  //   return this.makeRequest<FmpSearchResult[]>(url);
  // }

  /**
   * Build complete URL with base URL and API key
   */
  private buildUrl(endpoint: string, params: Record<string, string | number> = {}): string {
    const url = new URL(`/stable${endpoint}`, this.baseUrl);

    // Add all params
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });

    // Always add API key
    url.searchParams.append('apikey', this.apiKey);

    return url.toString();
  }

  /**
   * Generic method to make HTTP requests to FMP API
   */
  private async makeRequest<T>(url: string): Promise<T> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`FMP API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      logger.error(
        { message: 'FMP API request failed:', error: error as Error },
        { extra: { url: url.replace(this.apiKey, '***') } },
      );
      throw error;
    }
  }
}

export interface FmpSearchResult {
  symbol: string;
  name: string;
  currency?: string;
  stockExchange?: string;
  exchangeShortName?: string;
}

export interface FmpQuote {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  priceAvg50: number;
  priceAvg200: number;
  volume: number;
  avgVolume: number;
  exchange: string;
  open: number;
  previousClose: number;
  eps: number;
  pe: number;
  earningsAnnouncement?: string;
  sharesOutstanding: number;
  timestamp: number;
}

export interface FmpHistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  unadjustedVolume: number;
  change: number;
  changePercent: number;
  vwap: number;
  label: string;
  changeOverTime: number;
}

export interface FmpHistoricalLightPrice {
  symbol: string;
  date: string;
  price: number;
  volume: number;
}

export interface FmpHistoricalResponse {
  symbol: string;
  historical: FmpHistoricalPrice[];
}

export interface FmpHistoricalLightResponse {
  symbol: string;
  historical: FmpHistoricalLightPrice[];
}

export interface FmpClientOptions {
  apiKey: string;
}
