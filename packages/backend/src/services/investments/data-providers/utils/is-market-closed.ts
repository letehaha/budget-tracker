import { ASSET_CLASS } from '@bt/shared/types/investments';
import { isWeekend } from 'date-fns';

/**
 * v1: weekend-only. Returns true when the security's market was closed on the
 * given date and we should expect providers to return no data. Crypto trades
 * 24/7.
 *
 * TODO: exchange-specific holidays (NYSE July 4, WSE Polish holidays, NSE
 * Diwali, etc.) still slip through and generate Sentry noise. Add a holiday
 * calendar keyed by `exchangeAcronym` (already on Securities model — just
 * needs to be threaded into SecurityPriceFetchInput).
 */
export function isMarketClosedOn({ assetClass, date }: { assetClass: ASSET_CLASS; date: Date }): boolean {
  if (assetClass === ASSET_CLASS.crypto) return false;

  return isWeekend(date);
}

/**
 * Splits a list of items into ones whose markets were expected to be closed on
 * `date` (so missing data is not noteworthy) and ones that should have had data
 * (so missing data is a real signal).
 */
export function partitionByMarketStatus<T extends { assetClass: ASSET_CLASS }>({
  items,
  date,
}: {
  items: T[];
  date: Date;
}): {
  expectedClosed: T[];
  actuallyMissing: T[];
} {
  const expectedClosed: T[] = [];
  const actuallyMissing: T[] = [];

  for (const item of items) {
    if (isMarketClosedOn({ assetClass: item.assetClass, date })) {
      expectedClosed.push(item);
    } else {
      actuallyMissing.push(item);
    }
  }

  return { expectedClosed, actuallyMissing };
}
