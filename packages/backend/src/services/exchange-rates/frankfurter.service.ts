import { BadGateway, CustomError, ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import axios, { isAxiosError } from 'axios';
import { format, startOfDay } from 'date-fns';

interface FrankfurterResponse {
  amount: number;
  base: string; // base currency symbol, e.g. USD
  date: string; // yyyy-mm-dd
  rates: { [symbol: string]: number }; // SYMBOL - FLOAT rate
}

interface FrankfurterTimeSeriesResponse {
  amount: number;
  base: string; // base currency symbol, e.g. USD
  start_date: string; // yyyy-mm-dd
  end_date: string; // yyyy-mm-dd
  rates: { [date: string]: { [symbol: string]: number } }; // DATE - { SYMBOL - FLOAT rate }
}

const FRANKFURTER_BASE_URL = process.env.FRANKFURTER_BASE_URL || 'http://frankfurter:8080';
const FRANKFURTER_DATE_FORMAT = 'yyyy-MM-dd';
const FRANKFURTER_BASE_CURRENCY_CODE = 'USD';

// List of currencies supported by Frankfurt service
// Last updated: 2025-10-05
const FRANKFURTER_SUPPORTED_CURRENCIES = [
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

interface ExchangeRateData {
  baseCode: string;
  quoteCode: string;
  rate: number;
  date: Date;
}

/**
 * Fetches exchange rates from Frankfurt service for a specific date
 * @param date - The date to fetch rates for
 * @returns Array of exchange rate data compatible with ExchangeRates model
 */
export async function fetchFromFrankfurter(date: Date): Promise<ExchangeRateData[]> {
  const normalizedDate = startOfDay(date);
  const formattedDate = format(normalizedDate, FRANKFURTER_DATE_FORMAT);
  const url = `${FRANKFURTER_BASE_URL}/v1/${formattedDate}?from=${FRANKFURTER_BASE_CURRENCY_CODE}`;

  try {
    logger.info(`Attempting to fetch exchange rates from Frankfurt for date ${formattedDate}`);

    const response = await axios.get<FrankfurterResponse>(url, {
      timeout: 10000, // 10 second timeout
      responseType: 'json',
    });

    if (!response.data || !response.data.rates) {
      throw new ValidationError({
        message: 'Invalid response from Frankfurt service',
      });
    }

    if (response.data.base !== FRANKFURTER_BASE_CURRENCY_CODE) {
      logger.error(
        `Frankfurt rates fetching failed. Expected to load ${FRANKFURTER_BASE_CURRENCY_CODE}, got ${response.data.base}`,
      );
      throw new ValidationError({
        message: 'Invalid response from Frankfurt service',
      });
    }

    const rates = response.data.rates;

    // Convert response to ExchangeRates compatible format
    const rateData: ExchangeRateData[] = Object.entries(rates).map(([quoteCode, rate]) => ({
      baseCode: FRANKFURTER_BASE_CURRENCY_CODE,
      quoteCode,
      rate: Number(rate),
      date: normalizedDate,
    }));

    logger.info(`Successfully fetched ${rateData.length} exchange rates from Frankfurt for date ${formattedDate}`);

    return rateData;
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }

    if (isAxiosError(error)) {
      const statusCode = error.response?.status;

      if (error.code === 'ECONNABORTED') {
        logger.error('Frankfurt service timeout', { date: formattedDate, url });
        throw new BadGateway({
          message: 'Frankfurt service timeout',
        });
      }

      if (error.code === 'ECONNREFUSED') {
        logger.error('Frankfurt service unavailable', { date: formattedDate, url });
        throw new BadGateway({
          message: 'Frankfurt service is unavailable',
        });
      }

      if (statusCode === 404) {
        logger.warn('Frankfurt service returned 404 for date', { date: formattedDate, url });
        throw new ValidationError({
          message: `No exchange rates available for date ${formattedDate}`,
        });
      }

      if (statusCode && statusCode >= 500) {
        logger.error('Frankfurt service error', { statusCode, date: formattedDate, url });
        throw new BadGateway({
          message: 'Frankfurt service error',
        });
      }
    }

    logger.error('Unexpected error fetching from Frankfurt', {
      error: error instanceof Error ? error.message : String(error),
      date: formattedDate,
      url,
    });

    throw new BadGateway({
      message: 'Failed to fetch exchange rates from Frankfurt service',
    });
  }
}

/**
 * Fetches historical exchange rates from Frankfurt service for a date range
 * @param startDate - The start date of the range
 * @param endDate - The end date of the range
 * @returns Array of exchange rate data compatible with ExchangeRates model
 */
export async function fetchFromFrankfurterTimeSeries(startDate: Date, endDate: Date): Promise<ExchangeRateData[]> {
  const normalizedStartDate = startOfDay(startDate);
  const normalizedEndDate = startOfDay(endDate);
  const formattedStartDate = format(normalizedStartDate, FRANKFURTER_DATE_FORMAT);
  const formattedEndDate = format(normalizedEndDate, FRANKFURTER_DATE_FORMAT);
  const url = `${FRANKFURTER_BASE_URL}/v1/${formattedStartDate}..${formattedEndDate}?from=${FRANKFURTER_BASE_CURRENCY_CODE}`;

  try {
    logger.info(
      `Attempting to fetch time series exchange rates from Frankfurt from ${formattedStartDate} to ${formattedEndDate}`,
    );

    const response = await axios.get<FrankfurterTimeSeriesResponse>(url, {
      timeout: 30000, // 30 second timeout for potentially large date ranges
      responseType: 'json',
    });

    if (!response.data || !response.data.rates) {
      throw new ValidationError({
        message: 'Invalid response from Frankfurt service',
      });
    }

    if (response.data.base !== FRANKFURTER_BASE_CURRENCY_CODE) {
      logger.error(
        `Frankfurt rates fetching failed. Expected to load ${FRANKFURTER_BASE_CURRENCY_CODE}, got ${response.data.base}`,
      );
      throw new ValidationError({
        message: 'Invalid response from Frankfurt service',
      });
    }

    const rates = response.data.rates;

    // Convert response to ExchangeRates compatible format
    const rateData: ExchangeRateData[] = [];

    for (const [dateStr, currencyRates] of Object.entries(rates)) {
      const rateDate = startOfDay(new Date(dateStr));

      for (const [quoteCode, rate] of Object.entries(currencyRates)) {
        rateData.push({
          baseCode: FRANKFURTER_BASE_CURRENCY_CODE,
          quoteCode,
          rate: Number(rate),
          date: rateDate,
        });
      }
    }

    logger.info(
      `Successfully fetched ${rateData.length} exchange rates from Frankfurt from ${formattedStartDate} to ${formattedEndDate}`,
    );

    return rateData;
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }

    if (isAxiosError(error)) {
      const statusCode = error.response?.status;

      if (error.code === 'ECONNABORTED') {
        logger.error('Frankfurt service timeout', {
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          url,
        });
        throw new BadGateway({
          message: 'Frankfurt service timeout',
        });
      }

      if (error.code === 'ECONNREFUSED') {
        logger.error('Frankfurt service unavailable', {
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          url,
        });
        throw new BadGateway({
          message: 'Frankfurt service is unavailable',
        });
      }

      if (statusCode === 404) {
        logger.warn('Frankfurt service returned 404 for date range', {
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          url,
        });
        throw new ValidationError({
          message: `No exchange rates available for date range ${formattedStartDate} to ${formattedEndDate}`,
        });
      }

      if (statusCode && statusCode >= 500) {
        logger.error('Frankfurt service error', {
          statusCode,
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          url,
        });
        throw new BadGateway({
          message: 'Frankfurt service error',
        });
      }
    }

    logger.error('Unexpected error fetching time series from Frankfurt', {
      error: error instanceof Error ? error.message : String(error),
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      url,
    });

    throw new BadGateway({
      message: 'Failed to fetch time series exchange rates from Frankfurt service',
    });
  }
}

/**
 * Checks if a currency is supported by Frankfurt service
 * @param currencyCode - The currency code to check (e.g., 'EUR', 'USD')
 * @returns true if currency is supported, false otherwise
 */
export function isSupportedByFrankfurter(currencyCode: string): boolean {
  return FRANKFURTER_SUPPORTED_CURRENCIES.includes(currencyCode.toUpperCase());
}
