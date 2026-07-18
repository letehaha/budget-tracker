import { API_ERROR_CODES } from '@bt/shared/types';
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
 * user – there is nothing user-scoped about USD→EUR on 2020-03-15. Keying by
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
  bypassCache = false,
}: ExchangeRateParams): Promise<ExchangeRateReturnType> {
  const pair = {
    baseCode: baseCode.toUpperCase(),
    quoteCode: quoteCode.toUpperCase(),
  };

  // Same currency → 1, no auth or cache needed.
  if (pair.baseCode === pair.quoteCode) {
    return { ...pair, rate: 1, date };
  }

  // Order matters: auth and the custom-rate override both run before the global
  // cache, so a cache hit can never skip the "is the user allowed this currency?"
  // check or the user's own manual rate.
  const { liveRateUpdate } = await assertUserConnectedTo({ userId, code: pair.baseCode });

  const customRate = await resolveCustomRate({ userId, pair, liveRateUpdate });
  if (customRate) return customRate;

  const cacheKey = buildCacheKey({ date, baseCode: pair.baseCode, quoteCode: pair.quoteCode });
  if (!bypassCache) {
    const cached = await crossRateCache.read(cacheKey);
    if (cached) {
      return { ...pair, rate: cached.rate, date: new Date(cached.dateISO) };
    }
  }

  const { result, cacheable } = await computeCrossRate({ pair, date });
  // `bypassCache` also suppresses the write-back: these callers run inside the
  // uncommitted rate-write transaction, so caching a freshly computed rate now
  // would poison the 4h-TTL cache with a value that may still roll back.
  if (cacheable && !bypassCache) {
    await crossRateCache.write({ key: cacheKey, value: { rate: result.rate, dateISO: result.date.toISOString() } });
  }

  return result;
}

/**
 * Assert the user is connected to `code` and return their live-rate preference.
 * Throws not-found if they aren't – which is why it has to run before the cache.
 */
async function assertUserConnectedTo({
  userId,
  code,
}: {
  userId: number;
  code: string;
}): Promise<{ liveRateUpdate: boolean | null }> {
  const userCurrency = await findOrThrowNotFound({
    query: UsersCurrencies.findOne({
      where: { userId },
      attributes: ['liveRateUpdate'],
      include: [{ model: Currencies.default, where: { code }, attributes: [] }],
      raw: true,
    }),
    message: t({ key: 'currencies.currencyNotConnected' }),
    // Machine-readable code + the offending currency: callers that convert on
    // behalf of other records (e.g. subscriptions summary) surface this to the
    // client so it can tell the user exactly which currency to connect.
    code: API_ERROR_CODES.currencyNotConnected,
    details: { currencyCode: code },
  });

  return { liveRateUpdate: userCurrency.liveRateUpdate };
}

/**
 * The user's manual rate, if any. It only applies when they turned live rates
 * off AND are converting into their own base currency; otherwise there is no
 * custom rate and the caller falls through to the market cross-rate. Never
 * cached globally – it belongs to one user.
 */
async function resolveCustomRate({
  userId,
  pair,
  liveRateUpdate,
}: {
  userId: number;
  pair: { baseCode: string; quoteCode: string };
  liveRateUpdate: boolean | null;
}): Promise<ExchangeRateReturnType | null> {
  if (liveRateUpdate !== false) return null;

  const userDefault = await getBaseCurrency({ userId });
  if (pair.quoteCode !== userDefault.currency.code) return null;

  const [userRate] = await UserExchangeRates.getRates({ userId, pair });
  if (!userRate) return null;

  return { ...userRate, rate: formatRate(userRate.rate), custom: true };
}

/**
 * Resolve the market cross-rate for `pair` on `date` through the USD pivot, plus
 * whether it's safe to cache: only a rate built from exact-date rows on both
 * legs is `cacheable` – a fallback (a rate from another date) must not be served
 * as authoritative for the whole cache TTL.
 */
async function computeCrossRate({
  pair,
  date,
}: {
  pair: { baseCode: string; quoteCode: string };
  date: Date;
}): Promise<{ result: ExchangeRateReturnType; cacheable: boolean }> {
  const lookups = await resolveUsdRates({ codes: [pair.baseCode, pair.quoteCode], date });
  const baseLookup = lookups.get(pair.baseCode)!;
  const quoteLookup = lookups.get(pair.quoteCode)!;

  // A leg with no rate at all (and not USD itself) means the currency isn't
  // available from any provider for this date.
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
        variables: { baseCode: pair.baseCode, quoteCode: pair.quoteCode, date: date.toISOString() },
      }),
    });
  }

  let result: ExchangeRateReturnType;
  if (pair.baseCode === API_LAYER_BASE_CURRENCY_CODE) {
    // base is USD → use the quote rate directly
    result = { ...pair, rate: formatRate(rateValue(quoteLookup)), date: rateDateOf(quoteLookup, date) };
  } else if (pair.quoteCode === API_LAYER_BASE_CURRENCY_CODE) {
    // quote is USD → invert the base rate
    result = { ...pair, rate: formatRate(1 / rateValue(baseLookup)), date: rateDateOf(baseLookup, date) };
  } else {
    result = {
      ...pair,
      rate: formatRate(rateValue(quoteLookup) / rateValue(baseLookup)),
      date: rateDateOf(quoteLookup, date),
    };
  }

  const cacheable = baseLookup.kind === 'exact' && quoteLookup.kind === 'exact';
  return { result, cacheable };
}

// Helpers over the resolved RateLookup (imported from resolve-usd-rates).
// `rateValue` returns NaN only for `missing`, which the guard in
// `computeCrossRate` makes unreachable before any cross-rate math runs.
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
  /**
   * Skip the global cross-rate cache entirely — no read, no write-back. For
   * remeasure flows that run right after new rates land (rate sync, custom-rate
   * edits): a cached pre-change rate would re-anchor balances to stale FX, and
   * because these callers run inside the uncommitted rate-write transaction, writing
   * the fresh rate back would poison the cache with a value that may still roll back.
   */
  bypassCache?: boolean;
};

type ExchangeRateReturnType = {
  baseCode: string;
  quoteCode: string;
  date: Date;
  rate: number;
  // Add `custom` so client can understand that rate is custom
  custom?: boolean;
};
