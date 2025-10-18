import { logger } from '@js/utils';
import Currencies from '@models/Currencies.model';
import ExchangeRates from '@models/ExchangeRates.model';
import { format } from 'date-fns';

import { fetchFromFrankfurterTimeSeries } from './frankfurter.service';

// Frankfurter's earliest available data is from 1999-01-04 (when Euro was introduced)
const FRANKFURTER_START_DATE = new Date('1999-01-04');

/**
 * Initializes the database with historical exchange rates from Frankfurter.
 * This function is idempotent - it can be safely called multiple times.
 * On first run, it loads all historical data. On subsequent runs, it only inserts new data.
 */
export async function initializeHistoricalRates(): Promise<void> {
  try {
    const startDate = FRANKFURTER_START_DATE;
    const endDate = new Date();

    logger.info('Starting historical exchange rates initialization');

    // Get all valid currency codes from the database
    const validCurrencies = await Currencies.findAll({
      attributes: ['code'],
      raw: true,
    });
    const validCurrencyCodes = new Set(validCurrencies.map((c) => c.code));

    // Fetch all historical data from Frankfurter
    const allRates = await fetchFromFrankfurterTimeSeries(startDate, endDate);

    // Filter to only include currencies that exist in our database
    const validRates = allRates.filter(
      (rate) => validCurrencyCodes.has(rate.baseCode) && validCurrencyCodes.has(rate.quoteCode),
    );

    logger.info(`Filtered ${allRates.length} rates to ${validRates.length} valid rates (currencies exist in database)`);

    // Insert all rates, ignoring duplicates (idempotent operation)
    await ExchangeRates.bulkCreate(
      validRates.map((rate) => ({
        baseCode: rate.baseCode,
        quoteCode: rate.quoteCode,
        rate: rate.rate,
        date: rate.date,
      })),
      {
        ignoreDuplicates: true,
        logging: false,
      },
    );

    logger.info(
      `Historical exchange rates initialization completed. Loaded currency rates from ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`,
    );
  } catch (error) {
    logger.error('Failed to initialize historical exchange rates', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - we don't want to prevent the app from starting if this fails
    // The sync cron job will eventually fill in any missing data
  }
}
