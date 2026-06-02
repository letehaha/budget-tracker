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
 * Ensure exchange rates exist for `date`, hitting providers only when needed.
 *
 * "Needed" is decided by two questions, in order:
 *
 *  1. Coverage — do the requested `currencies` already have exact-date USD-base
 *     rows? If all present, there is nothing to fetch.
 *  2. Comprehensiveness — has the comprehensive provider (ApiLayer) already run
 *     for this date? Detected by the presence of ANY row sourced from ApiLayer
 *     on that date. ApiLayer answers per-DATE (its whole ~150-currency basket),
 *     so if it ran and a currency is still absent, that currency is
 *     authoritatively unavailable for the date and re-fetching is futile.
 *
 * This replaces an earlier `existingRatesCount > 50` heuristic — a fragile proxy
 * for "ApiLayer ran" coupled to provider coverage counts — and the `force` flag
 * that callers used to override it (which also leaked the heuristic and was
 * silently dropped by the in-flight dedup key).
 *
 * Omitting `currencies` means "full sync" (the daily cron): the coverage check
 * is skipped and only the comprehensiveness gate applies — a fresh date is
 * fetched, an already-comprehensive one is skipped.
 *
 * Deduplicated by date so concurrent callers for the same date share one fetch.
 */
export const ensureRatesForDate = withDeduplication(
  async (date: Date, { currencies }: { currencies?: string[] } = {}): Promise<void> => {
    const normalizedDate = startOfDay(date);
    const formattedDate = format(normalizedDate, API_LAYER_DATE_FORMAT);

    try {
      // 1. Coverage: specific currencies requested and all already present → done.
      if (currencies && currencies.length > 0) {
        const missing = await findUncoveredCurrencies({ date: normalizedDate, currencies });
        if (missing.length === 0) {
          return undefined;
        }
      }

      // 2. Comprehensiveness: if ApiLayer already ran for this date, any
      //    still-missing currency is authoritatively unavailable — don't re-fetch.
      if (await isDateComprehensivelyFetched(normalizedDate)) {
        logger.info(`[Exchange Rates] ${formattedDate} already covered by ApiLayer, skipping provider fetch`);
        return undefined;
      }

      // 3. Fetch from providers (priority order + gap-filling merge).
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

      // Convert rates to database format. Each rate carries its own source — the
      // provider that actually supplied it (rates are merged across providers).
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
    // Dedup by date only — concurrent callers for the same date share one fetch,
    // regardless of which currencies each one asked about. The `_options` param
    // is kept in the signature (though unused for keying) so the wrapper infers
    // the optional second argument and callers may invoke with just a date.
    keyGenerator: (date: Date, _options?: { currencies?: string[] }) => format(date, 'yyyy-MM-dd'),
    ttl: 30000, // Keep cache for 30 seconds after completion
  },
);

/**
 * Which of `currencies` lack an exact-date USD-base row for `date`.
 * USD itself is never "missing" — it is the implicit base (rate 1).
 */
async function findUncoveredCurrencies({ date, currencies }: { date: Date; currencies: string[] }): Promise<string[]> {
  const wanted = currencies.map((c) => c.toUpperCase()).filter((c) => c !== API_LAYER_BASE_CURRENCY_CODE);
  if (wanted.length === 0) {
    return [];
  }

  const existing = await ExchangeRates.findAll({
    where: {
      date,
      baseCode: API_LAYER_BASE_CURRENCY_CODE,
      quoteCode: { [Op.in]: wanted },
    },
    attributes: ['quoteCode'],
    raw: true,
  });

  const present = new Set(existing.map((row) => row.quoteCode));
  return wanted.filter((code) => !present.has(code));
}

/**
 * Has the comprehensive provider (ApiLayer) already supplied data for this date?
 * Detected via the presence of any ApiLayer-sourced row (see the module doc for
 * why one such row is sufficient proof the date was comprehensively fetched).
 */
async function isDateComprehensivelyFetched(date: Date): Promise<boolean> {
  const count = await ExchangeRates.count({
    where: { date, source: EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER },
  });
  return count > 0;
}
