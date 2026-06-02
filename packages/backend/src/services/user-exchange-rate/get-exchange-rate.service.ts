import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { UnexpectedError } from '@js/errors';
import { logger } from '@js/utils';
import { CacheClient } from '@js/utils/cache';
import * as Currencies from '@models/currencies.model';
import * as UserExchangeRates from '@models/user-exchange-rates.model';
import UsersCurrencies, { getBaseCurrency } from '@models/users-currencies.model';
import { API_LAYER_BASE_CURRENCY_CODE } from '@services/exchange-rates/constants';
import { type RateLookup, resolveUsdRates } from '@services/exchange-rates/resolve-usd-rates';

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

  // Resolve both legs in one shot. resolveUsdRates owns the whole read → gate →
  // fetch-once → re-read decision and returns the resolved lookup per code, so
  // there's no second round of DB reads or coverage logic to keep in sync here.
  const lookups = await resolveUsdRates({ codes: [pair.baseCode, pair.quoteCode], date });
  const baseLookup = lookups.get(pair.baseCode)!;
  const quoteLookup = lookups.get(pair.quoteCode)!;

  // Still nothing for a non-USD currency after the fetch attempt → the currency
  // is not available from any provider for this date.
  if (
    (baseLookup.kind === 'missing' && pair.baseCode !== API_LAYER_BASE_CURRENCY_CODE) ||
    (quoteLookup.kind === 'missing' && pair.quoteCode !== API_LAYER_BASE_CURRENCY_CODE)
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
      rate: formatRate(rateValue(quoteLookup)), // base is USD → use the quote rate directly
      date: rateDateOf(quoteLookup, date),
    };
  } else if (pair.quoteCode === API_LAYER_BASE_CURRENCY_CODE) {
    result = {
      ...pair,
      rate: formatRate(1 / rateValue(baseLookup)), // quote is USD → invert the base rate
      date: rateDateOf(baseLookup, date),
    };
  } else {
    const crossRate = rateValue(quoteLookup) / rateValue(baseLookup);
    result = {
      ...pair,
      rate: formatRate(crossRate),
      date: rateDateOf(quoteLookup, date),
    };
  }

  // Only cache results derived from exact-date rates on BOTH legs. A `fallback`
  // (most-recent rate from another date) must not be written under the requested
  // date's key: the real rate for that date can still land within the 4h TTL
  // (e.g. today's rate published after an early lookup), and a cached fallback
  // would keep being served as authoritative until it expired. Exact rows for a
  // given date don't change within the TTL, so caching those is safe.
  if (baseLookup.kind === 'exact' && quoteLookup.kind === 'exact') {
    await crossRateCache.write({
      key: cacheKey,
      value: { rate: result.rate, dateISO: result.date.toISOString() },
    });
  }

  return result;
}

// Helpers over the resolved RateLookup (imported from resolve-usd-rates).
// `rateValue` returns NaN only for `missing`, which the guard above makes
// unreachable before any cross-rate math runs.
const rateValue = (lookup: RateLookup): number => (lookup.kind === 'missing' ? NaN : lookup.rate);

const rateDateOf = (lookup: RateLookup, requestedDate: Date): Date => {
  if (lookup.kind === 'exact') return lookup.date;
  if (lookup.kind === 'fallback') return lookup.rateDate;
  return requestedDate;
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
