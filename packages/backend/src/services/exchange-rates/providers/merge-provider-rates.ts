/**
 * Pure merge logic for combining exchange rates from multiple providers.
 *
 * Kept free of I/O so the priority/gap-fill rules can be unit-tested directly,
 * instead of only through the full HTTP-mocked sync. Both the daily and the
 * historical fallback paths in the registry delegate here so they share one
 * definition of "merge by priority".
 */
import { EXCHANGE_RATE_PROVIDER_TYPE } from '@bt/shared/types';

/** A single quote currency's rate together with the provider that supplied it. */
export interface AttributedRate {
  rate: number;
  source: EXCHANGE_RATE_PROVIDER_TYPE;
}

/** Rates returned by one provider for one date, awaiting merge. */
export interface ProviderRatesInput {
  type: EXCHANGE_RATE_PROVIDER_TYPE;
  name: string;
  rates: Record<string, number>;
}

/** How many new rates each provider supplied to the merged result. */
export interface ProviderContribution {
  name: string;
  type: EXCHANGE_RATE_PROVIDER_TYPE;
  ratesContributed: number;
}

interface MergeResult {
  /** quoteCode -> { rate, source }. Rate and source always travel together. */
  rates: Record<string, AttributedRate>;
  /** Providers that supplied at least one rate, in the order they were given. */
  providersUsed: ProviderContribution[];
}

/**
 * An exchange rate is only usable if it is finite and strictly positive. A 0,
 * negative, NaN or Infinity value is treated as "not supplied" so a healthy
 * lower-priority provider can fill the slot instead of the bad value winning it
 * and being persisted — otherwise a currency could silently freeze on garbage.
 */
function isUsableRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0;
}

/**
 * Merge provider rates given in PRIORITY ORDER (highest priority first).
 *
 * A lower-priority provider only fills currencies a higher-priority one didn't
 * already supply — so both the rate value AND its source come from the highest
 * priority provider that had it. The base currency is never emitted as a quote
 * (no `USD -> USD = 1` self-rate row).
 */
export function mergeProviderRates({
  providerRates,
  baseCurrency,
}: {
  providerRates: ProviderRatesInput[];
  baseCurrency: string;
}): MergeResult {
  const rates: Record<string, AttributedRate> = {};
  const providersUsed: ProviderContribution[] = [];

  for (const provider of providerRates) {
    let ratesContributed = 0;

    for (const [quoteCode, rate] of Object.entries(provider.rates)) {
      if (quoteCode === baseCurrency) continue;
      // Skip invalid values so they neither persist nor block a fallback fill.
      if (!isUsableRate(rate)) continue;
      if (rates[quoteCode] === undefined) {
        rates[quoteCode] = { rate, source: provider.type };
        ratesContributed += 1;
      }
    }

    // A provider whose currencies were all already covered contributed nothing
    // and is deliberately omitted, so the summary reflects real coverage.
    if (ratesContributed > 0) {
      providersUsed.push({ name: provider.name, type: provider.type, ratesContributed });
    }
  }

  return { rates, providersUsed };
}

/**
 * Currencies expected but absent from the merged result, excluding the base
 * currency (which is never a quote). Used to surface coverage gaps.
 */
export function findMissingCurrencies({
  expected,
  covered,
  baseCurrency,
}: {
  expected: string[];
  covered: string[];
  baseCurrency: string;
}): string[] {
  const have = new Set(covered);
  return expected.filter((code) => code !== baseCurrency && !have.has(code));
}
