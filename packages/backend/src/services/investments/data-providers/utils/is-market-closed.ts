import { ASSET_CLASS } from '@bt/shared/types/investments';
import { toUtcDateString } from '@common/utils/date';
import { isWeekend } from 'date-fns';

// US Market Holidays (NYSE, NASDAQ, NYSEARCA, AMEX, BATS, ARCA)
const US_HOLIDAYS = new Set([
  // 2025
  '2025-01-01',
  '2025-01-20',
  '2025-02-17',
  '2025-04-18',
  '2025-05-26',
  '2025-06-19',
  '2025-07-04',
  '2025-09-01',
  '2025-11-27',
  '2025-12-25',
  // 2026
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25',
  // 2027
  '2027-01-01',
  '2027-01-18',
  '2027-02-15',
  '2027-03-26',
  '2027-05-31',
  '2027-06-18',
  '2027-07-05',
  '2027-09-06',
  '2027-11-25',
  '2027-12-24',
]);

// Euronext Market Holidays (Amsterdam, Paris, etc. - AMS, PAR, EURONEXT, XAMS, XPAR)
const EURONEXT_HOLIDAYS = new Set([
  // 2025
  '2025-01-01',
  '2025-04-18',
  '2025-04-21',
  '2025-12-25',
  '2025-12-26',
  // 2026
  '2026-01-01',
  '2026-04-03',
  '2026-04-06',
  '2026-12-25',
  '2026-12-26',
  // 2027
  '2027-01-01',
  '2027-03-26',
  '2027-03-29',
  '2027-12-24',
  '2027-12-25',
  '2027-12-26',
]);

// Warsaw Stock Exchange Holidays (GPW, WSE, WAR)
const GPW_HOLIDAYS = new Set([
  // 2025
  '2025-01-01',
  '2025-01-06',
  '2025-04-18',
  '2025-04-21',
  '2025-05-01',
  '2025-05-03',
  '2025-06-19',
  '2025-08-15',
  '2025-11-01',
  '2025-11-11',
  '2025-12-24',
  '2025-12-25',
  '2025-12-26',
  '2025-12-31',
  // 2026
  '2026-01-01',
  '2026-01-06',
  '2026-04-03',
  '2026-04-06',
  '2026-05-01',
  '2026-05-03',
  '2026-06-04',
  '2026-08-15',
  '2026-11-01',
  '2026-11-11',
  '2026-12-24',
  '2026-12-25',
  '2026-12-26',
  '2026-12-31',
  // 2027
  '2027-01-01',
  '2027-01-06',
  '2027-03-26',
  '2027-03-29',
  '2027-05-01',
  '2027-05-03',
  '2027-05-27',
  '2027-08-15',
  '2027-11-01',
  '2027-11-11',
  '2027-12-24',
  '2027-12-25',
  '2027-12-26',
  '2027-12-31',
]);

// Indian Stock Exchange Holidays (NSE, BSE)
const NSE_HOLIDAYS = new Set([
  // 2025
  '2025-02-26',
  '2025-03-14',
  '2025-03-31',
  '2025-04-10',
  '2025-04-14',
  '2025-04-18',
  '2025-05-01',
  '2025-08-15',
  '2025-08-27',
  '2025-10-02',
  '2025-10-21',
  '2025-10-22',
  '2025-11-05',
  '2025-12-25',
  // 2026
  '2026-01-15',
  '2026-01-26',
  '2026-03-03',
  '2026-03-26',
  '2026-03-31',
  '2026-04-03',
  '2026-04-14',
  '2026-05-01',
  '2026-05-28',
  '2026-06-26',
  '2026-09-14',
  '2026-10-02',
  '2026-10-20',
  '2026-11-10',
  '2026-11-24',
  '2026-12-25',
  // 2027
  '2027-01-26',
  '2027-03-26',
  '2027-04-14',
  '2027-12-25',
]);

function isHolidayFor({ exchangeAcronym, date }: { exchangeAcronym: string; date: Date }): boolean {
  const acronym = exchangeAcronym.toUpperCase().trim();
  const dateStr = toUtcDateString(date);

  if (['NYSE', 'NASDAQ', 'NYSEARCA', 'AMEX', 'BATS', 'ARCA'].includes(acronym)) {
    return US_HOLIDAYS.has(dateStr);
  }

  if (['AMS', 'PAR', 'EURONEXT', 'XAMS', 'XPAR'].includes(acronym)) {
    return EURONEXT_HOLIDAYS.has(dateStr);
  }

  if (['GPW', 'WSE', 'WAR'].includes(acronym)) {
    return GPW_HOLIDAYS.has(dateStr);
  }

  if (['NSE', 'BSE'].includes(acronym)) {
    return NSE_HOLIDAYS.has(dateStr);
  }

  return false;
}

/**
 * Returns true when the security's market was closed on the given date and we
 * should expect providers to return no data. Crypto trades 24/7.
 */
export function isMarketClosedOn({
  assetClass,
  date,
  exchangeAcronym,
}: {
  assetClass: ASSET_CLASS;
  date: Date;
  exchangeAcronym?: string | null;
}): boolean {
  if (assetClass === ASSET_CLASS.crypto) return false;

  if (isWeekend(date)) return true;

  if (exchangeAcronym) {
    return isHolidayFor({ exchangeAcronym, date });
  }

  return false;
}

/**
 * Splits a list of items into ones whose markets were expected to be closed on
 * `date` (so missing data is not noteworthy) and ones that should have had data
 * (so missing data is a real signal).
 */
export function partitionByMarketStatus<T extends { assetClass: ASSET_CLASS; exchangeAcronym?: string | null }>({
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
    if (isMarketClosedOn({ assetClass: item.assetClass, date, exchangeAcronym: item.exchangeAcronym })) {
      expectedClosed.push(item);
    } else {
      actuallyMissing.push(item);
    }
  }

  return { expectedClosed, actuallyMissing };
}
