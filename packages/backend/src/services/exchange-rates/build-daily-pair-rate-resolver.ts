import { connection } from '@models/connection';
import { buildUsdRateLookup } from '@services/stats/build-usd-rate-lookup';
import { createFindLatestUsdRate } from '@services/stats/get-combined-balance-history/exchange-rate-lookup';
import { QueryTypes, Transaction as SequelizeTransaction } from 'sequelize';

import { API_LAYER_BASE_CURRENCY_CODE } from './constants';

export const MS_PER_DAY = 86_400_000;

/** Same 5-decimal truncation `getExchangeRate` applies, so a resolved rate matches
 *  what every other conversion in the app produces for that day. */
export const formatRate = (rate: number) => Math.trunc(rate * 100000) / 100000;

/** UTC calendar day of a timestamp, or the day part of a `DATEONLY` string. */
export const toDayKey = (date: Date | string): string =>
  typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);

export type DailyPairRateResolver = (dayKey: string) => number | null;

/**
 * Per-day `baseCode → quoteCode` rate from the USD-pivot rows: exact day, else the
 * most recent earlier day, else the earliest day known for that currency.
 *
 * Returns `null` when either leg has no stored rate at all, and the resolver returns
 * `null` for a day neither leg covers.
 */
export const buildDailyPairRateResolver = async ({
  baseCode,
  quoteCode,
  from,
  to,
  transaction,
}: {
  baseCode: string;
  quoteCode: string;
  from: Date;
  to: Date;
  transaction?: SequelizeTransaction;
}): Promise<DailyPairRateResolver | null> => {
  const quoteCodes = [baseCode, quoteCode];

  const systemRates = (await connection.sequelize.query(
    `SELECT "quoteCode", "date", "rate"
       FROM "ExchangeRates"
      WHERE "baseCode" = :pivotCode AND "quoteCode" IN (:quoteCodes) AND "date" >= :from AND "date" < :toExclusive
      ORDER BY "quoteCode", "date" ASC`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        pivotCode: API_LAYER_BASE_CURRENCY_CODE,
        quoteCodes,
        from,
        toExclusive: new Date(+to + MS_PER_DAY),
      },
      transaction,
    },
  )) as { quoteCode: string; date: Date; rate: number }[];

  const { usdRatesMap, usdRateDatesByQuote } = await buildUsdRateLookup({
    systemRates,
    quoteCodes,
    windowStart: toDayKey(from),
  });
  const findLatestUsdRate = createFindLatestUsdRate({ usdRatesMap, usdRateDatesByQuote });

  const hasAnyRate = (code: string) =>
    code === API_LAYER_BASE_CURRENCY_CODE || (usdRateDatesByQuote.get(code)?.length ?? 0) > 0;

  if (!hasAnyRate(baseCode) || !hasAnyRate(quoteCode)) return null;

  const findUsdRate = (code: string, dayKey: string): number | null => {
    const latest = findLatestUsdRate(code, dayKey);
    if (latest !== null) return latest;

    // Days before the first stored rate borrow it: any rate beats no rate.
    const earliest = usdRateDatesByQuote.get(code)?.[0];
    return earliest ? (usdRatesMap.get(`${code}_${earliest}`) ?? null) : null;
  };

  return (dayKey: string) => {
    const usdToBase = findUsdRate(baseCode, dayKey);
    const usdToQuote = findUsdRate(quoteCode, dayKey);
    if (usdToBase == null || usdToQuote == null || usdToBase === 0) return null;

    // Truncation to 5 decimals collapses a sub-0.00001 rate to 0, and a zero rate
    // would be written as a valid history of zero balances.
    const rate = formatRate(usdToQuote / usdToBase);
    return rate > 0 ? rate : null;
  };
};
