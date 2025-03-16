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

  if (!process.env.API_LAYER_API_KEY) {
    logger.error(`API_LAYER_API_KEY is missing. Tried to load exchange rates for date ${normalizedDate}`);
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

  // Fetch new rates from an API (replace with your actual API endpoint)
  try {
    let response: API_LAYER_EXCHANGE_RATES_RESPONSE | null = null;

    try {
      response = (
        await axios<API_LAYER_EXCHANGE_RATES_RESPONSE>({
          url: API_URL,
          headers: {
            apikey: process.env.API_LAYER_API_KEY,
          },
          responseType: 'json',
          method: 'GET',
        })
      ).data;
    } catch (err) {
      if (isAxiosError(err)) {
        // List of error codes
        // https://apilayer.com/marketplace/fixer-api?utm_source=apilayermarketplace&utm_medium=featured#errors

        const params = {
          date: formattedDate,
          base: API_LAYER_BASE_CURRENCY_CODE,
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
            logger.error('Error 429. Failed to load exchange rates due to rate limiter.', { ...params, url: API_URL });
            throw new TooManyRequests({ message: 'Too many requests.' });
          } else if (statusCode >= 500 && statusCode < 600) {
            throw new BadGateway({ message: badGatewayErrorMessage });
          }
        }
      } else {
        throw err;
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
