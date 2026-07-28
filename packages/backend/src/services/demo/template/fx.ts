import { roundHalfToEven } from '@common/utils/round-half-to-even';

/**
 * Synthetic exchange-rate curve for demo transactions.
 *
 * The demo converts every non-USD amount to its base-currency `refAmount` by
 * hand. Real historical rates are deliberately not used: the shared
 * `ExchangeRates` table is global rather than per-user and e2e treats it as
 * fixed seed data, so having demo signups fetch and write rates for three years
 * of dates would leak into other users' lookups and into the test corpus.
 *
 * A curve rather than one frozen number means the EUR and PLN accounts drift
 * against USD over the history window, which is the whole point of showing
 * multi-currency at all. Both waves are sine-based and therefore exactly zero at
 * `dayOffset: 0`, so today's rate equals the configured spot rate and matches
 * what `UsersCurrencies` stores.
 */
interface CurrencyDrift {
  /** Peak swing of the long wave, as a fraction of the spot rate. */
  longAmplitude: number;
  longPeriodDays: number;
  /** Peak swing of the short wave, layered on top so the line is not a clean sine. */
  shortAmplitude: number;
  shortPeriodDays: number;
}

const CURRENCY_DRIFT: Record<string, CurrencyDrift> = {
  EUR: { longAmplitude: 0.05, longPeriodDays: 430, shortAmplitude: 0.015, shortPeriodDays: 97 },
  PLN: { longAmplitude: 0.09, longPeriodDays: 380, shortAmplitude: 0.025, shortPeriodDays: 61 },
};

/**
 * Quote units per 1 unit of base currency, `dayOffset` days before today.
 *
 * Returns `spotRate` unchanged for currencies with no configured drift, so an
 * added currency falls back to a flat rate rather than throwing.
 */
export function rateForDayOffset({
  currencyCode,
  dayOffset,
  spotRate,
}: {
  currencyCode: string;
  dayOffset: number;
  spotRate: number;
}): number {
  const drift = CURRENCY_DRIFT[currencyCode];
  if (!drift) return spotRate;

  const long = drift.longAmplitude * Math.sin((2 * Math.PI * dayOffset) / drift.longPeriodDays);
  const short = drift.shortAmplitude * Math.sin((2 * Math.PI * dayOffset) / drift.shortPeriodDays);

  return spotRate * (1 + long + short);
}

/**
 * Base-currency cents for an amount held in `currencyCode` on a given day.
 *
 * `spotRate` is quote-per-base, so converting back to base divides.
 */
export function toBaseCurrencyCents({
  amount,
  currencyCode,
  dayOffset,
  spotRate,
}: {
  amount: number;
  currencyCode: string;
  dayOffset: number;
  spotRate: number | undefined;
}): number {
  if (!spotRate) return amount;

  const rate = rateForDayOffset({ currencyCode, dayOffset, spotRate });
  return roundHalfToEven(amount / rate);
}
