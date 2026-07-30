import { ASSET_CLASS } from '@bt/shared/types/investments';
import { isWeekend } from 'date-fns';

/**
 * Returns true if the market for the security was closed on the given date. If
 * the market was closed, the providers send no data. Crypto markets are open on
 * all days.
 *
 * Weekends only. Exchange holidays go to `actuallyMissing`, which the code logs
 * at the info level. Do not add a manual holiday calendar: it becomes incorrect
 * after its last year with no warning, and each provider writes a different
 * `exchangeAcronym` value.
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
