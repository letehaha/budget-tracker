import { API_ERROR_CODES } from '@bt/shared/types';
import { BadGateway, CustomError, ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import ExchangeRates from '@models/ExchangeRates.model';
import { withDeduplication } from '@services/common/with-deduplication';
import { format, startOfDay } from 'date-fns';

import { exchangeRateProviderRegistry } from './providers';

// Used in tests
export const API_LAYER_ENDPOINT_REGEX = /https:\/\/api.apilayer.com\/fixer/;
export const FRANKFURTER_ENDPOINT_REGEX = /http:\/\/frankfurter:8080\/v1/;
export const CURRENCY_RATES_API_ENDPOINT_REGEX = /http:\/\/currency-rates-api:8080/;
export const API_LAYER_DATE_FORMAT = 'yyyy-MM-dd';
export const API_LAYER_BASE_CURRENCY_CODE = 'USD';

/**
 * Fetch exchange rates for a specific date using the modular provider system.
 *
 * Providers are tried in priority order:
 * 1. Currency Rates API (custom service)
 * 2. Frankfurter (free ECB data)
 * 3. ApiLayer (comprehensive, paid)
 *
 * Includes deduplication to prevent concurrent calls for the same date.
 */
export const fetchExchangeRatesForDate = withDeduplication(
  async (date: Date): Promise<void> => {
    const normalizedDate = startOfDay(date);
    const formattedDate = format(normalizedDate, API_LAYER_DATE_FORMAT);

    try {
      // Check if we already have rates for this date
      const existingRatesCount = await ExchangeRates.count({
        where: { date: normalizedDate },
      });

      // If we have a substantial number of rates, skip to avoid redundant API calls
      // 50+ rates indicates a comprehensive provider (ApiLayer) was already used
      if (existingRatesCount > 50) {
        logger.info(
          `Found ${existingRatesCount} rates for ${formattedDate}, skipping sync to avoid redundant API calls`,
        );
        return undefined;
      }

      if (existingRatesCount > 0) {
        logger.info(
          `Found ${existingRatesCount} rates for ${formattedDate}, will attempt to fetch more from providers`,
        );
      }

      // Fetch rates using the provider registry (handles priority and fallback)
      const fetchResult = await exchangeRateProviderRegistry.fetchRatesWithFallback({
        date: normalizedDate,
        baseCurrency: API_LAYER_BASE_CURRENCY_CODE,
      });

      if (!fetchResult || Object.keys(fetchResult.result.rates).length === 0) {
        throw new BadGateway({
          code: API_ERROR_CODES.currencyProviderUnavailable,
          message: 'Failed to load exchange rates from all providers',
        });
      }

      const { result, providerName } = fetchResult;

      // Convert rates to database format
      const rateEntries = Object.entries(result.rates).map(([quoteCode, rate]) => ({
        baseCode: result.baseCurrency,
        quoteCode,
        rate,
        date: normalizedDate,
      }));

      // Bulk insert with duplicate handling
      await ExchangeRates.bulkCreate(rateEntries, {
        ignoreDuplicates: true,
      });

      logger.info(
        `[Exchange Rates: ${providerName}] Rates for ${formattedDate} successfully processed. ` +
          `Fetched ${rateEntries.length} rates. (Duplicates automatically ignored)`,
      );
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      logger.error('Error fetching exchange rates:', {
        error: error instanceof Error ? error.message : String(error),
        date: formattedDate,
      });

      throw new ValidationError({
        message: 'Failed to fetch exchange rates',
      });
    }
  },
  {
    keyGenerator: (date: Date) => format(date, 'yyyy-MM-dd'),
    ttl: 30000, // Keep cache for 30 seconds after completion
  },
);
