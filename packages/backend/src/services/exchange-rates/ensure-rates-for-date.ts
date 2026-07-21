import { API_ERROR_CODES, EXCHANGE_RATE_PROVIDER_TYPE } from '@bt/shared/types';
import { BadGateway, CustomError, ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import ExchangeRates from '@models/exchange-rates.model';
import { withDeduplication } from '@services/common/with-deduplication';
import { format, startOfDay } from 'date-fns';
import { Op } from 'sequelize';

import { API_LAYER_BASE_CURRENCY_CODE, API_LAYER_DATE_FORMAT } from './constants';
import { exchangeRateProviderRegistry } from './providers';

/**
 * Fetch the full provider basket for `date` and store it – unconditionally.
 *
 * This is the raw "go get the rates" primitive; the decision of WHETHER a fetch
 * is worth it lives in the callers (`ensureRatesForDate` for the daily full sync,
 * `resolveUsdRates` for on-demand lookups).
 *
 * Deduplicated by date so concurrent callers for the same date – a cron sync and
 * a flurry of on-demand lookups – collapse into a single upstream fetch.
 */
export const fetchAndStoreRatesForDate = withDeduplication(
  async (date: Date): Promise<void> => {
    const normalizedDate = startOfDay(date);
    const formattedDate = format(normalizedDate, API_LAYER_DATE_FORMAT);

    try {
      const fetchResult = await exchangeRateProviderRegistry.fetchRatesWithFallback({
        date: normalizedDate,
        baseCurrency: API_LAYER_BASE_CURRENCY_CODE,
      });

      if (!fetchResult || Object.keys(fetchResult.merged.rates).length === 0) {
        throw new BadGateway({
          code: API_ERROR_CODES.currencyProviderUnavailable,
          message: 'Failed to load exchange rates from all providers',
        });
      }

      const { merged, providersUsed } = fetchResult;

      // Each rate carries its own source – the provider that actually supplied it
      // (rates are merged across providers).
      const rateEntries = Object.entries(merged.rates).map(([quoteCode, { rate, source }]) => ({
        baseCode: merged.baseCurrency,
        quoteCode,
        rate,
        date: normalizedDate,
        source,
      }));

      await ExchangeRates.bulkCreate(rateEntries, {
        ignoreDuplicates: true,
      });

      const providerSummary = providersUsed.map((p) => `${p.name}(${p.ratesContributed})`).join(', ');
      logger.info(
        `[Exchange Rates] Rates for ${formattedDate} successfully processed. ` +
          `Fetched ${rateEntries.length} rates from: ${providerSummary}. (Duplicates automatically ignored)`,
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
    // Dedup by date – concurrent callers for the same date share one fetch.
    keyGenerator: (date: Date) => format(date, 'yyyy-MM-dd'),
    ttl: 30000, // Keep cache for 30 seconds after completion
  },
);

/**
 * Daily full-sync entry point (the cron). Fetches the whole basket for `date`
 * unless it's already been fetched as comprehensively as it can be – making a
 * same-day re-run a no-op.
 */
export async function ensureRatesForDate(date: Date): Promise<void> {
  const normalizedDate = startOfDay(date);

  if (await isDateComprehensivelyFetched(normalizedDate)) {
    logger.info(
      `[Exchange Rates] ${format(normalizedDate, API_LAYER_DATE_FORMAT)} already comprehensively fetched, skipping provider fetch`,
    );
    return;
  }

  await fetchAndStoreRatesForDate(normalizedDate);
}

/**
 * Has this date already been fetched as comprehensively as it can be? True when
 * a row from a WHOLE-BASKET provider – fawazahmed0 or ApiLayer – exists for the
 * date. Both answer per-DATE with their entire basket, so once either has run
 * any currency still absent (e.g. one neither provider quotes) is genuinely
 * unavailable for that date, and re-fetching is futile.
 *
 * currency-rates-api is deliberately NOT a signal here: it only ever supplies
 * its ~38 currencies, so its rows never prove the exotic tail was attempted.
 * Below fawazahmed0's 2024-03-02 floor it never runs, so ApiLayer is the sole
 * comprehensiveness signal there – which is correct, as ApiLayer is the only
 * source for old exotic dates.
 *
 * Accepted imprecision: if fawazahmed0 left a gap AND the ApiLayer attempt to
 * fill it failed in the same run, the fawazahmed0 rows still mark the date
 * "done" and the gap is never retried for that date. Requires two coincident
 * failures, damages one currency for one date (readers fall back to the
 * nearest-date rate), and the degraded-sync alert reports the ApiLayer failure
 * – so this stays a simple row-existence check rather than a coverage audit.
 */
export async function isDateComprehensivelyFetched(date: Date): Promise<boolean> {
  const count = await ExchangeRates.count({
    where: {
      date,
      source: { [Op.in]: [EXCHANGE_RATE_PROVIDER_TYPE.FAWAZ_CURRENCY_API, EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER] },
    },
  });
  return count > 0;
}
