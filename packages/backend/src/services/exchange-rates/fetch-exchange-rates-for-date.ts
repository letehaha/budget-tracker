import { BadGateway, CustomError, ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import Currencies from '@models/Currencies.model';
import ExchangeRates from '@models/ExchangeRates.model';
import { withDeduplication } from '@services/common/with-deduplication';
import axios, { isAxiosError } from 'axios';
import { format, startOfDay } from 'date-fns';

import { fetchFromFrankfurter } from './frankfurter.service';

interface API_LAYER_EXCHANGE_RATES_RESPONSE {
  base: string; // base currency symbol, e.g. USD
  date: string; // yyyy-mm-dd
  historical: boolean;
  rates: { [symbol: string]: number }; // SYMBOL - FLOAT rate
  success: boolean;
  timestamp: number;
}

// Used in tests
export const API_LAYER_ENDPOINT_REGEX = /https:\/\/api.apilayer.com\/fixer/;
export const FRANKFURTER_ENDPOINT_REGEX = /http:\/\/frankfurter:8080\/v1/;
export const API_LAYER_DATE_FORMAT = 'yyyy-MM-dd';
export const API_LAYER_BASE_CURRENCY_CODE = 'USD';

export const fetchExchangeRatesForDate = withDeduplication(
  async (date: Date): Promise<void> => {
    // Normalize the date to start of day
    const normalizedDate = startOfDay(date);

    if (!process.env.API_LAYER_API_KEYS) {
      logger.error(`API_LAYER_API_KEYS is missing. Tried to load exchange rates for date ${normalizedDate}`);
      throw new BadGateway({ message: 'Unexpected error with currency rates provider.' });
    }

    // Parse API keys from comma-separated string
    const apiKeys =
      process.env.API_LAYER_API_KEYS?.split(',')
        .map((key) => key.trim())
        .filter((key) => key) || [];

    if (apiKeys.length === 0) {
      logger.error('No valid API keys found in API_LAYER_API_KEYS');
      throw new BadGateway({ message: 'Unexpected error with currency rates provider.' });
    }

    try {
      // TODO: Improve this logic with proper fetch attempt tracking (ExchangeRatesFetchLog table or Redis cache)
      // to avoid repeated API calls for currencies that providers don't have

      // Check if we've already attempted a comprehensive fetch for this date
      // If >50 rates exist, assume ApiLayer (comprehensive provider with 150+ currencies) was already tried
      // If <50 rates exist, only Frankfurter (30 currencies) was tried, so we should attempt ApiLayer
      const existingRatesCount = await ExchangeRates.count({
        where: { date: normalizedDate },
      });

      if (existingRatesCount > 50) {
        logger.info(
          `Found ${existingRatesCount} rates for this date, indicating ApiLayer was already attempted. Skipping sync to avoid wasting API calls.`,
        );
        return undefined;
      }

      if (existingRatesCount > 0 && existingRatesCount <= 50) {
        logger.info(
          `Found ${existingRatesCount} rates for this date (Frankfurter only). Will attempt ApiLayer to get full currency set.`,
        );
      }

      const formattedDate = format(normalizedDate, API_LAYER_DATE_FORMAT);

      // HYBRID APPROACH: Try ApiLayer first, fallback to Frankfurter if needed
      const apiLayerRates: { rate: number; baseCode: string; quoteCode: string }[] = [];
      let apiLayerFailed = false;

      const API_URL = `https://api.apilayer.com/fixer/${formattedDate}?base=${API_LAYER_BASE_CURRENCY_CODE}`;

      // Step 1: Try to fetch from ApiLayer with retry logic for different API keys
      let response: API_LAYER_EXCHANGE_RATES_RESPONSE | null = null;

      logger.info('Attempting to fetch exchange rates from ApiLayer');

      // Try each API key until success or all keys exhausted
      for (let i = 0; i < apiKeys.length; i++) {
        const currentApiKey = apiKeys[i];

        try {
          logger.info(`Attempting to fetch exchange rates with API key ${i + 1}/${apiKeys.length}`);

          response = (
            await axios<API_LAYER_EXCHANGE_RATES_RESPONSE>({
              url: API_URL,
              headers: {
                apikey: currentApiKey,
              },
              responseType: 'json',
              method: 'GET',
            })
          ).data;

          // If we get here, the request was successful - exit the retry loop
          logger.info(
            `Successfully fetched exchange rates using API key ${i + 1}/${apiKeys.length}. Exiting retry loop.`,
          );
          break;
        } catch (err) {
          if (isAxiosError(err)) {
            // List of error codes
            // https://apilayer.com/marketplace/fixer-api?utm_source=apilayermarketplace&utm_medium=featured#errors

            const params = {
              date: formattedDate,
              base: API_LAYER_BASE_CURRENCY_CODE,
              apiKeyIndex: i + 1,
            };
            const badGatewayErrorMessage =
              'Failed to load exchange rates due to the issues with the external provider.';
            const statusCode = err.response?.status;

            if (statusCode) {
              if (statusCode === 400) {
                logger.error('Error 400. Failed to load exchange rates due to unacceptable request.', params);
                throw new BadGateway({ message: badGatewayErrorMessage });
              } else if (statusCode === 401) {
                logger.error('Error 401. Failed to load exchange rates due to invalid API key.', params);
                throw new BadGateway({ message: badGatewayErrorMessage });
              } else if (statusCode === 404) {
                logger.error('Error 404. Failed to load exchange rates due 404 error.', { ...params, url: API_URL });
                throw new BadGateway({ message: badGatewayErrorMessage });
              } else if (statusCode === 429) {
                logger.warn(
                  `Error 429. Rate limit reached for API key ${i + 1}/${apiKeys.length}. ${i < apiKeys.length - 1 ? 'Trying next key...' : 'All keys exhausted.'}`,
                  { ...params, url: API_URL },
                );

                // If this is the last API key, mark as failed to trigger Frankfurter fallback
                if (i === apiKeys.length - 1) {
                  apiLayerFailed = true;
                  logger.warn('All API keys exhausted due to rate limiting, will fallback to Frankfurter');
                  break;
                }

                // Continue to next API key
                continue;
              } else if (statusCode >= 500 && statusCode < 600) {
                // Server error - fallback to Frankfurter instead of throwing
                apiLayerFailed = true;
                logger.warn(`ApiLayer server error (${statusCode}), will fallback to Frankfurter`);
                break;
              } else if (statusCode === 403 && err.response?.data.includes('consume')) {
                logger.error('Error 403. Failed to load exchange rates due 403 error.', {
                  ...params,
                  url: API_URL,
                  data: err.response?.data,
                });
                throw new BadGateway({ message: badGatewayErrorMessage });
              }
            }
          } else {
            // Unknown error - fallback to Frankfurter
            apiLayerFailed = true;
            logger.warn('Unknown ApiLayer error, will fallback to Frankfurter', {
              error: err instanceof Error ? err.message : String(err),
            });
            break;
          }
        }
      }

      // Step 2: Process ApiLayer response if successful
      if (response && response.rates && !apiLayerFailed) {
        if (response.base !== API_LAYER_BASE_CURRENCY_CODE) {
          logger.error(
            `Exchange rates fetching failed. Expected to load ${API_LAYER_BASE_CURRENCY_CODE}, got ${response.base}`,
          );
          throw new ValidationError({
            message: 'Invalid response from exchange rate API',
          });
        }

        const rates = response.rates;
        const allCurrencies = await Currencies.findAll();

        // Extract all currencies from ApiLayer
        for (const currency of allCurrencies) {
          if (currency.code !== API_LAYER_BASE_CURRENCY_CODE && rates[currency.code]) {
            apiLayerRates.push({
              baseCode: API_LAYER_BASE_CURRENCY_CODE,
              quoteCode: currency.code,
              rate: rates[currency.code]!,
            });
          }
        }

        logger.info(`Successfully fetched ${apiLayerRates.length} rates from ApiLayer`);
      }

      // Step 3: Fallback to Frankfurter if ApiLayer failed
      let frankfurterRates: { rate: number; baseCode: string; quoteCode: string }[] = [];

      if (apiLayerFailed) {
        try {
          logger.info('ApiLayer failed, attempting to fetch exchange rates from Frankfurter service');
          const frankfurterData = await fetchFromFrankfurter(normalizedDate);
          frankfurterRates = frankfurterData.map((rate) => ({
            baseCode: rate.baseCode,
            quoteCode: rate.quoteCode,
            rate: rate.rate,
          }));
          logger.info(`Successfully fetched ${frankfurterRates.length} rates from Frankfurter as fallback`);
        } catch (frankfurterError) {
          // If Frankfurter returns validation error, preserve it
          if (frankfurterError instanceof ValidationError) {
            throw frankfurterError;
          }

          logger.error('Both ApiLayer and Frankfurter failed', {
            error: frankfurterError instanceof Error ? frankfurterError.message : String(frankfurterError),
          });
          throw new BadGateway({
            message: 'Failed to load exchange rates from all providers',
          });
        }
      }

      // Step 4: Combine rates (either ApiLayer or Frankfurter)
      const allRates = [...apiLayerRates, ...frankfurterRates];

      if (allRates.length === 0) {
        throw new ValidationError({
          message: 'No exchange rates were loaded from any provider',
        });
      }

      // Use the normalized date for consistency
      const loadedDate = normalizedDate;

      // Step 6: Bulk insert combined rates
      await ExchangeRates.bulkCreate(
        allRates.map((rate) => ({
          ...rate,
          date: loadedDate,
        })),
        {
          ignoreDuplicates: true, // Don't error if rate for a specific date already exists
        },
      );

      logger.info(
        `Exchange rates for date ${format(loadedDate, 'yyyy-MM-dd')} successfully processed. ` +
          `ApiLayer: ${apiLayerRates.length} rates, Frankfurter: ${frankfurterRates.length} rates, Total: ${allRates.length} rates. ` +
          `(Duplicates automatically ignored)`,
      );
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      } else {
        console.error('Error fetching exchange rates:', error);
        throw new ValidationError({
          message: 'Failed to fetch exchange rates',
        });
      }
    }
  },
  {
    keyGenerator: (date: Date) => format(date, 'yyyy-MM-dd'),
    ttl: 30000, // Keep cache for 30 seconds after completion
  },
);
