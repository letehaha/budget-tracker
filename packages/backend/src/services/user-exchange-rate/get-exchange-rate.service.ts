import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { UnexpectedError } from '@js/errors';
import { logger } from '@js/utils';
import { CacheClient } from '@js/utils/cache';
import * as Currencies from '@models/currencies.model';
import * as ExchangeRates from '@models/exchange-rates.model';
import * as UserExchangeRates from '@models/user-exchange-rates.model';
import UsersCurrencies, { getBaseCurrency } from '@models/users-currencies.model';
import {
  API_LAYER_BASE_CURRENCY_CODE,
  fetchExchangeRatesForDate,
} from '@services/exchange-rates/fetch-exchange-rates-for-date';
import { endOfDay, startOfDay } from 'date-fns';
import { Op } from 'sequelize';

// Round to 5 precision
const formatRate = (rate: number) => Math.trunc(rate * 100000) / 100000;

/**
 * Global cache for computed cross-rates.
 *
 * The conversion `baseCode → quoteCode on date D` is the same number for every
 * user — there is nothing user-scoped about USD→EUR on 2020-03-15. Keying by
 * user would store N identical copies and miss N times before populating. The
 * per-user custom-rate override (liveRateUpdate=false) deliberately bypasses
 * this cache and is resolved from the DB on every call instead.
 */
type CachedCrossRate = { rate: number; dateISO: string };
const crossRateCache = new CacheClient<CachedCrossRate>({
  logPrefix: 'CrossRate',
  ttl: 3600 * 4, // 4 hours
  parseJson: true,
});

/**
 * Build a stable cache key from the request. Date is sliced to YYYY-MM-DD so
 * callers asking for the same day at different times of day collapse to one
 * entry, and codes are uppercased so case variations don't split the cache.
 */
function buildCacheKey({ date, baseCode, quoteCode }: { date: Date; baseCode: string; quoteCode: string }): string {
  const dateISO = date.toISOString().slice(0, 10);
  return `cross_rate:${dateISO}:${baseCode.toUpperCase()}:${quoteCode.toUpperCase()}`;
}

export async function getExchangeRate({
  userId,
  date,
  baseCode,
  quoteCode,
}: ExchangeRateParams): Promise<ExchangeRateReturnType> {
  const pair = {
    baseCode: baseCode.toUpperCase(),
    quoteCode: quoteCode.toUpperCase(),
  };

  // Same currency → 1, no auth or cache needed.
  if (pair.baseCode === pair.quoteCode) {
    return {
      baseCode: pair.baseCode,
      quoteCode: pair.quoteCode,
      rate: 1,
      date,
    };
  }

  // Auth runs BEFORE the cache read on purpose: the cache is now global, so
  // a hit cannot be allowed to silently bypass "is the user actually allowed
  // to use this currency?". Single indexed lookup, cheap.
  const userCurrency = await findOrThrowNotFound({
    query: UsersCurrencies.findOne({
      where: { userId },
      attributes: ['liveRateUpdate'],
      include: [
        {
          model: Currencies.default,
          where: { code: pair.baseCode },
          attributes: [], // No need to fetch extra attributes
        },
      ],
      raw: true,
    }),
    message: t({ key: 'currencies.currencyNotConnected' }),
  });

  const userDefaultCurrency = await getBaseCurrency({ userId });

  // If user has custom live rate AND quote_code is user's base_currency, then
  // skip any checks and calculations and simply return what user has set.
  // Per-user value, deliberately not cached via the global cross-rate cache.
  if (userCurrency.liveRateUpdate === false && pair.quoteCode === userDefaultCurrency.currency.code) {
    const [userExchangeRate] = await UserExchangeRates.getRates({
      userId,
      pair,
    });

    if (userExchangeRate) {
      return {
        ...userExchangeRate,
        rate: formatRate(userExchangeRate.rate),
        custom: true,
      };
    }
  }

  // Global cross-rate cache check. Sits AFTER auth + custom-rate so neither
  // gate is bypassed by a hit, and uncached paths above remain per-user-correct.
  const cacheKey = buildCacheKey({ date, baseCode: pair.baseCode, quoteCode: pair.quoteCode });
  const cachedResult = await crossRateCache.read(cacheKey);
  if (cachedResult) {
    return {
      baseCode: pair.baseCode,
      quoteCode: pair.quoteCode,
      rate: cachedResult.rate,
      date: new Date(cachedResult.dateISO),
    };
  }

  let baseRate: ExchangeRateReturnType | null = null;
  let quoteRate: ExchangeRateReturnType | null = null;

  baseRate = await loadRate(pair.baseCode, date);
  quoteRate = await loadRate(pair.quoteCode, date);

  // Fetch exchange rates if we're missing data
  // Note: loadRate returns { rate: 1 } for USD, so we only need to check for null
  const needsFetch = !baseRate || !quoteRate;

  // Also fetch if we only have stale fallback rates from a different date.
  // loadRate returns the most recent rate as fallback when no exact-date match exists,
  // but we should still attempt to fetch current rates for the requested date.
  const hasStaleRates = !needsFetch && (!isRateForDate(baseRate, date) || !isRateForDate(quoteRate, date));

  if (needsFetch || hasStaleRates) {
    try {
      // When a required rate is entirely absent, force past the "looks
      // comprehensive" count-skip in the fetcher — otherwise a date that
      // already holds many other rates would never backfill this one.
      await fetchExchangeRatesForDate(date, { force: needsFetch });
    } catch (e) {
      // If we have no rates at all, propagate the error
      if (needsFetch) throw e;
      // If we have fallback rates from a different date, log and continue
      logger.warn(`[getExchangeRate] Failed to fetch rates for ${date.toISOString()}, using fallback rates`);
    }

    // Retry fetching missing or stale rates after the API call
    if (!baseRate || !isRateForDate(baseRate, date)) {
      baseRate = await loadRate(pair.baseCode, date);
    }
    if (!quoteRate || !isRateForDate(quoteRate, date)) {
      quoteRate = await loadRate(pair.quoteCode, date);
    }
  }

  // If still no rates found in the DB after fetching, it means the currency
  // is not available from the exchange rate providers
  if (
    (!baseRate && pair.baseCode !== API_LAYER_BASE_CURRENCY_CODE) ||
    (!quoteRate && pair.quoteCode !== API_LAYER_BASE_CURRENCY_CODE)
  ) {
    logger.error(
      `[getExchangeRate] Rate unavailable: pair=${pair.baseCode}/${pair.quoteCode}, date=${date.toISOString()}`,
    );
    throw new UnexpectedError({
      message: t({
        key: 'currencies.exchangeRateNotAvailable',
        variables: {
          baseCode: pair.baseCode,
          quoteCode: pair.quoteCode,
          date: date.toISOString(),
        },
      }),
    });
  }

  let result: ExchangeRateReturnType;

  if (pair.baseCode === API_LAYER_BASE_CURRENCY_CODE) {
    result = {
      ...pair,
      rate: formatRate(quoteRate!.rate), // Directly use the base rate
      date: quoteRate!.date,
    };
  } else if (pair.quoteCode === API_LAYER_BASE_CURRENCY_CODE) {
    result = {
      ...pair,
      rate: formatRate(1 / baseRate!.rate), // Invert the quote rate
      date: baseRate!.date,
    };
  } else {
    const crossRate = quoteRate!.rate / baseRate!.rate;
    result = {
      ...pair,
      rate: formatRate(crossRate),
      date: quoteRate!.date,
    };
  }

  await crossRateCache.write({
    key: cacheKey,
    value: { rate: result.rate, dateISO: result.date.toISOString() },
  });

  return result;
}

const isRateForDate = (rate: ExchangeRateReturnType | null, requestedDate: Date): boolean => {
  if (!rate) return false;
  return startOfDay(rate.date).getTime() === startOfDay(requestedDate).getTime();
};

const loadRate = async (code: string, rateDate: Date): Promise<ExchangeRateReturnType | null> => {
  if (code === API_LAYER_BASE_CURRENCY_CODE) {
    // No need to fetch if it's the API's default base currency
    return {
      baseCode: code,
      quoteCode: code,
      rate: 1,
      date: rateDate,
    };
  }
  const liveRateWhereCondition = {
    date: { [Op.between]: [startOfDay(rateDate), endOfDay(rateDate)] },
  };

  const result = await ExchangeRates.default.findOne({
    where: {
      ...liveRateWhereCondition,
      baseCode: API_LAYER_BASE_CURRENCY_CODE,
      quoteCode: code,
    },
    raw: true,
  });

  if (result) {
    return {
      baseCode: result.baseCode,
      quoteCode: result.quoteCode,
      rate: result.rate,
      date: result.date,
    };
  }

  // Fallback: find the most recent rate regardless of date
  const fallback = await ExchangeRates.default.findOne({
    where: {
      baseCode: API_LAYER_BASE_CURRENCY_CODE,
      quoteCode: code,
    },
    order: [['date', 'DESC']],
    raw: true,
  });

  if (fallback) {
    logger.info(
      `[loadRate] Using fallback rate for ${code} from ${fallback.date} (requested ${rateDate.toISOString()})`,
    );
    return {
      baseCode: fallback.baseCode,
      quoteCode: fallback.quoteCode,
      rate: fallback.rate,
      date: fallback.date,
    };
  }

  return null;
};

type ExchangeRateParams = {
  userId: number;
  date: Date;
  baseCode: string;
  quoteCode: string;
};

type ExchangeRateReturnType = {
  baseCode: string;
  quoteCode: string;
  date: Date;
  rate: number;
  // Add `custom` so client can understand that rate is custom
  custom?: boolean;
};
