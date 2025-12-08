import { logger } from '@js/utils';
import Currencies from '@models/Currencies.model';
import ExchangeRates from '@models/ExchangeRates.model';
import { format, startOfDay } from 'date-fns';

import { exchangeRateProviderRegistry } from './providers';

// Fallback date if no providers are registered (should not happen in practice)
const FALLBACK_START_DATE = new Date('1999-01-04');

/**
 * Initializes the database with historical exchange rates.
 * Uses the provider registry to fetch data from the highest-priority provider
 * that supports historical data loading.
 *
 * This function is idempotent - it can be safely called multiple times.
 * On first run, it loads all historical data. On subsequent runs, it only inserts new data.
 */
export async function initializeHistoricalRates(): Promise<void> {
  try {
    const startDate = exchangeRateProviderRegistry.getEarliestHistoricalDate() ?? FALLBACK_START_DATE;
    const endDate = new Date();

    logger.info('Starting historical exchange rates initialization');

    // Get all valid currency codes from the database
    const validCurrencies = await Currencies.findAll({
      attributes: ['code'],
      raw: true,
    });
    const validCurrencyCodes = new Set(validCurrencies.map((c) => c.code));

    // Fetch historical data using the provider registry (with priority-based fallback)
    const fetchResult = await exchangeRateProviderRegistry.fetchHistoricalRatesWithFallback({
      startDate,
      endDate,
    });

    if (!fetchResult) {
      logger.error('No providers available for historical data loading. Historical rates will not be initialized.');
      return;
    }

    const { results, providerName } = fetchResult;

    // Convert provider results to rate entries
    const allRates: { baseCode: string; quoteCode: string; rate: number; date: Date }[] = [];
    for (const result of results) {
      const rateDate = startOfDay(new Date(result.date));
      for (const [quoteCode, rate] of Object.entries(result.rates)) {
        allRates.push({
          baseCode: result.baseCurrency,
          quoteCode,
          rate,
          date: rateDate,
        });
      }
    }

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
      `[Historical Rates: ${providerName}] Initialization completed. Loaded currency rates from ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`,
    );
  } catch (error) {
    logger.error('Failed to initialize historical exchange rates', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - we don't want to prevent the app from starting if this fails
    // The sync cron job will eventually fill in any missing data
  }
}
