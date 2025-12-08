/**
 * Frankfurter Provider
 *
 * Free exchange rate service based on ECB data.
 * Limited currency coverage (~32 currencies) but no authentication required.
 *
 * Priority: 2 (secondary fallback)
 */
import axios, { isAxiosError } from 'axios';

import { BaseExchangeRateProvider } from '../base-provider';
import {
  EXCHANGE_RATE_PROVIDER_TYPE,
  ExchangeRateProviderMetadata,
  ExchangeRateResult,
  FetchRatesParams,
  FetchRatesRangeParams,
} from '../types';

/**
 * Response format from Frankfurter for single date
 */
interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * Response format from Frankfurter for date range
 */
interface FrankfurterTimeSeriesResponse {
  amount: number;
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
}

const FRANKFURTER_BASE_URL = process.env.FRANKFURTER_BASE_URL || 'http://frankfurter:8080';
const REQUEST_TIMEOUT = 10000; // 10 seconds
const RANGE_REQUEST_TIMEOUT = 30000; // 30 seconds for range requests

/**
 * List of currencies supported by Frankfurter service
 * Based on ECB reference rates
 * Last updated: 2025-10-05
 */
export const FRANKFURTER_SUPPORTED_CURRENCIES = [
  'AUD',
  'BGN',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'JPY',
  'KRW',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'RON',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'USD',
  'ZAR',
];

export class FrankfurterProvider extends BaseExchangeRateProvider {
  readonly metadata: ExchangeRateProviderMetadata = {
    type: EXCHANGE_RATE_PROVIDER_TYPE.FRANKFURTER,
    name: 'Frankfurter',
    description: 'Free exchange rate API based on ECB data',
    priority: 2, // Secondary fallback
    supportedCurrencies: FRANKFURTER_SUPPORTED_CURRENCIES,
    minHistoricalDate: '1999-01-04',
    supportsHistoricalDataLoading: true,
  };

  /**
   * Check if the Frankfurter service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Frankfurter doesn't have a health endpoint, so we try fetching latest rates
      const response = await axios.get(`${FRANKFURTER_BASE_URL}/v1/latest`, {
        timeout: 5000,
      });
      return response.status === 200 && response.data?.rates;
    } catch {
      this.logWarn('Frankfurter service is not available');
      return false;
    }
  }

  /**
   * Fetch exchange rates for a specific date
   */
  async fetchRatesForDate(params: FetchRatesParams): Promise<ExchangeRateResult | null> {
    const formattedDate = this.formatDate(params.date);
    const baseCurrency = this.getBaseCurrency(params);

    const url = `${FRANKFURTER_BASE_URL}/v1/${formattedDate}?from=${baseCurrency}`;

    try {
      this.logInfo(`Fetching rates for ${formattedDate}`);

      const response = await axios.get<FrankfurterResponse>(url, {
        timeout: REQUEST_TIMEOUT,
        responseType: 'json',
      });

      if (!response.data || !response.data.rates) {
        this.logWarn(`Invalid response for date ${formattedDate}`);
        return null;
      }

      // Validate base currency
      if (response.data.base !== baseCurrency) {
        this.logError(`Expected base ${baseCurrency}, got ${response.data.base}`);
        return null;
      }

      const rates = this.filterRatesByCurrencies({
        rates: response.data.rates,
        targetCurrencies: params.targetCurrencies,
      });

      this.logInfo(`Fetched ${Object.keys(rates).length} rates for ${formattedDate}`);

      return {
        date: response.data.date,
        baseCurrency: response.data.base,
        rates,
      };
    } catch (error) {
      this.handleFetchError({ error, date: formattedDate });
      return null;
    }
  }

  /**
   * Fetch exchange rates for a date range using the time series endpoint
   */
  async fetchRatesForDateRange(params: FetchRatesRangeParams): Promise<ExchangeRateResult[]> {
    const formattedStartDate = this.formatDate(params.startDate);
    const formattedEndDate = this.formatDate(params.endDate);
    const baseCurrency = this.getBaseCurrency(params);

    const url = `${FRANKFURTER_BASE_URL}/v1/${formattedStartDate}..${formattedEndDate}?from=${baseCurrency}`;

    try {
      this.logInfo(`Fetching rates for range ${formattedStartDate} to ${formattedEndDate}`);

      const response = await axios.get<FrankfurterTimeSeriesResponse>(url, {
        timeout: RANGE_REQUEST_TIMEOUT,
        responseType: 'json',
      });

      if (!response.data || !response.data.rates) {
        this.logWarn(`Invalid response for range ${formattedStartDate} to ${formattedEndDate}`);
        return [];
      }

      const results: ExchangeRateResult[] = [];

      for (const [date, rates] of Object.entries(response.data.rates)) {
        const filteredRates = this.filterRatesByCurrencies({
          rates,
          targetCurrencies: params.targetCurrencies,
        });

        results.push({
          date,
          baseCurrency: response.data.base,
          rates: filteredRates,
        });
      }

      this.logInfo(`Fetched rates for ${results.length} dates in range`);

      return results;
    } catch (error) {
      this.handleFetchError({ error, date: `${formattedStartDate}..${formattedEndDate}` });
      return [];
    }
  }

  /**
   * Handle fetch errors with appropriate logging
   */
  private handleFetchError({ error, date }: { error: unknown; date: string }): void {
    if (isAxiosError(error)) {
      const statusCode = error.response?.status;

      if (error.code === 'ECONNABORTED') {
        this.logError('Request timeout', { date });
        return;
      }

      if (error.code === 'ECONNREFUSED') {
        this.logError('Service unavailable (connection refused)', { date });
        return;
      }

      if (statusCode === 404) {
        this.logWarn(`No data available for ${date}`);
        return;
      }

      if (statusCode && statusCode >= 500) {
        this.logError(`Server error ${statusCode}`, { date });
        return;
      }
    }

    this.logError('Unexpected error fetching rates', {
      error: error instanceof Error ? error.message : String(error),
      date,
    });
  }
}

/**
 * Checks if a currency is supported by Frankfurter
 */
export function isSupportedByFrankfurter(currencyCode: string): boolean {
  return FRANKFURTER_SUPPORTED_CURRENCIES.includes(currencyCode.toUpperCase());
}

/**
 * Earliest available data from Frankfurter (when EUR was introduced)
 */
export const FRANKFURTER_START_DATE = new Date('1999-01-04');
