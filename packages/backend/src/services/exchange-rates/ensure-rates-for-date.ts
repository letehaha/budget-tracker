import { API_ERROR_CODES, EXCHANGE_RATE_PROVIDER_TYPE } from '@bt/shared/types';
import { BadGateway, CustomError, ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import ExchangeRates from '@models/exchange-rates.model';
import { withDeduplication } from '@services/common/with-deduplication';
import { format, startOfDay } from 'date-fns';

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
 * unless the comprehensive provider (ApiLayer) has already covered it – making a
 * same-day re-run a no-op.
 */
export async function ensureRatesForDate(date: Date): Promise<void> {
  const normalizedDate = startOfDay(date);

  if (await isDateComprehensivelyFetched(normalizedDate)) {
    logger.info(
      `[Exchange Rates] ${format(normalizedDate, API_LAYER_DATE_FORMAT)} already covered by ApiLayer, skipping provider fetch`,
    );
    return;
  }

  await fetchAndStoreRatesForDate(normalizedDate);
}

/**
 * Has the comprehensive provider (ApiLayer) already supplied data for this date?
 * Detected via the presence of any ApiLayer-sourced row. ApiLayer answers
 * per-DATE (its whole ~150-currency basket), so a single such row proves the
 * date was comprehensively fetched – any currency still absent is genuinely
 * unavailable for the date, and re-fetching is futile.
 */
export async function isDateComprehensivelyFetched(date: Date): Promise<boolean> {
  const count = await ExchangeRates.count({
    where: { date, source: EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER },
  });
  return count > 0;
}
