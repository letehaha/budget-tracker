import { BadGateway, CustomError, TooManyRequests, ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import Currencies from '@models/Currencies.model';
import ExchangeRates from '@models/ExchangeRates.model';
import { withTransaction } from '@services/common';
import axios, { isAxiosError } from 'axios';
import { format, parse, startOfDay } from 'date-fns';

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
export const API_LAYER_DATE_FORMAT = 'yyyy-MM-dd';
export const API_LAYER_BASE_CURRENCY_CODE = 'USD';

export const fetchExchangeRatesForDate = withTransaction(async (date: Date): Promise<void> => {
  // Normalize the date to start of day
  const normalizedDate = startOfDay(date);

  if (!process.env.API_LAYER_API_KEYS && process.env.NODE_ENV !== 'test') {
    logger.error(`API_LAYER_API_KEYS is missing. Tried to load exchange rates for date ${normalizedDate}`);
    return undefined;
  }

  // Check if rates already exist for this date
  const existingRates = await ExchangeRates.findOne({
    where: { date: normalizedDate },
  });

  if (existingRates) {
    logger.info('Exchange rates for this date already exist. Returning existing data.');
    return undefined;
  }

  const formattedDate = format(normalizedDate, API_LAYER_DATE_FORMAT);
  const API_URL = `https://api.apilayer.com/fixer/${formattedDate}?base=${API_LAYER_BASE_CURRENCY_CODE}`;

  // Parse API keys from comma-separated string
  const apiKeys =
    process.env.API_LAYER_API_KEYS?.split(',')
      .map((key) => key.trim())
      .filter((key) => key) || [];

  if (apiKeys.length === 0 && process.env.NODE_ENV !== 'test') {
    logger.error('No valid API keys found in API_LAYER_API_KEYS');
    return undefined;
  }

  // Fetch new rates from an API with retry logic for different API keys
  try {
    let response: API_LAYER_EXCHANGE_RATES_RESPONSE | null = null;

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
        // If data loaded successfully, exit the loop earlier
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
          const badGatewayErrorMessage = 'Failed to load exchange rates due to the issues with the external provider.';
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

              // If this is the last API key, throw the error
              if (i === apiKeys.length - 1) {
                logger.error('Error 429. All API keys exhausted due to rate limiting.', { ...params, url: API_URL });
                throw new TooManyRequests({
                  message: 'Too many requests. All API keys have reached their rate limit.',
                });
              }

              // Continue to next API key
              continue;
            } else if (statusCode >= 500 && statusCode < 600) {
              throw new BadGateway({ message: badGatewayErrorMessage });
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
          throw err;
        }
      }
    }

    if (!response || !response.rates) {
      throw new ValidationError({
        message: 'Invalid response from exchange rate API',
      });
    }

    if (response.base !== API_LAYER_BASE_CURRENCY_CODE) {
      logger.error(
        `Exchange rates fetching failed. Expected to load ${API_LAYER_BASE_CURRENCY_CODE}, got ${response.base}`,
      );
      throw new ValidationError({
        message: 'Invalid response from exchange rate API',
      });
    }

    const rates = response.rates;
    const currencies = await Currencies.findAll();

    // Prepare data for bulk insert
    const rateData: { rate: number; baseCode: string; quoteCode: string }[] = [];
    for (const currency of currencies) {
      if (rates[currency.code]) {
        rateData.push({
          baseCode: API_LAYER_BASE_CURRENCY_CODE,
          quoteCode: currency.code,
          rate: rates[currency.code]!,
        });
      }
    }
    const currenciesRecord = currencies.reduce(
      (acc, curr) => {
        acc[curr.code] = curr;
        return acc;
      },
      {} as { [currencyCode: string]: Currencies },
    );

    const loadedDate = parse(response.date, API_LAYER_DATE_FORMAT, new Date());

    // Bulk insert new rates
    await ExchangeRates.bulkCreate(
      rateData.map((rate) => ({
        ...rate,
        date: loadedDate,
        baseId: currenciesRecord[rate.baseCode]?.id,
        quoteId: currenciesRecord[rate.quoteCode]?.id,
      })),
    );

    logger.info(`Exchange rates for date ${loadedDate} successfully loaded.`);
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
});
