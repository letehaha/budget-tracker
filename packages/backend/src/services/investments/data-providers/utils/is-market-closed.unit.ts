import { ASSET_CLASS } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';

import { isMarketClosedOn, partitionByMarketStatus } from './is-market-closed';

// Local-time constructors so getDay() returns the same weekday in any TZ.
const MONDAY = new Date(2026, 4, 4, 12, 0, 0);
const FRIDAY = new Date(2026, 4, 8, 12, 0, 0);
const SATURDAY = new Date(2026, 4, 9, 12, 0, 0);
const SUNDAY = new Date(2026, 4, 10, 12, 0, 0);

describe('isMarketClosedOn', () => {
  it('returns true for stocks on Saturday', () => {
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: SATURDAY })).toBe(true);
  });

  it('returns true for stocks on Sunday', () => {
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: SUNDAY })).toBe(true);
  });

  it('returns false for stocks on weekdays', () => {
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: MONDAY })).toBe(false);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: FRIDAY })).toBe(false);
  });

  it('returns false for crypto on weekends (24/7 market)', () => {
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.crypto, date: SATURDAY })).toBe(false);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.crypto, date: SUNDAY })).toBe(false);
  });

  it('treats fixed_income / options / cash / other as weekend-closed', () => {
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.fixed_income, date: SATURDAY })).toBe(true);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.options, date: SATURDAY })).toBe(true);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.cash, date: SUNDAY })).toBe(true);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.other, date: SUNDAY })).toBe(true);
  });

  it('detects exchange-specific holidays', () => {
    // US Holiday: July 3, 2026 (Observed Independence Day - Friday)
    const US_HOLIDAY = new Date(2026, 6, 3, 12, 0, 0);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: US_HOLIDAY, exchangeAcronym: 'NYSE' })).toBe(true);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: US_HOLIDAY, exchangeAcronym: 'NASDAQ' })).toBe(
      true,
    );
    // US holiday should not trigger closed for GPW or NSE if it's not a holiday there
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: US_HOLIDAY, exchangeAcronym: 'GPW' })).toBe(false);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: US_HOLIDAY, exchangeAcronym: 'NSE' })).toBe(false);
    // US holiday should not trigger if exchangeAcronym is missing
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: US_HOLIDAY })).toBe(false);

    // GPW Holiday: November 11, 2026 (Independence Day - Wednesday)
    const GPW_HOLIDAY = new Date(2026, 10, 11, 12, 0, 0);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: GPW_HOLIDAY, exchangeAcronym: 'GPW' })).toBe(true);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: GPW_HOLIDAY, exchangeAcronym: 'WSE' })).toBe(true);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: GPW_HOLIDAY, exchangeAcronym: 'NYSE' })).toBe(
      false,
    );

    // Euronext Holiday: April 6, 2026 (Easter Monday - Monday)
    const EURONEXT_HOLIDAY = new Date(2026, 3, 6, 12, 0, 0);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: EURONEXT_HOLIDAY, exchangeAcronym: 'AMS' })).toBe(
      true,
    );
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: EURONEXT_HOLIDAY, exchangeAcronym: 'PAR' })).toBe(
      true,
    );
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: EURONEXT_HOLIDAY, exchangeAcronym: 'NYSE' })).toBe(
      false,
    );

    // Indian Holiday: January 26, 2026 (Republic Day - Monday)
    const INDIAN_HOLIDAY = new Date(2026, 0, 26, 12, 0, 0);
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: INDIAN_HOLIDAY, exchangeAcronym: 'NSE' })).toBe(
      true,
    );
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: INDIAN_HOLIDAY, exchangeAcronym: 'BSE' })).toBe(
      true,
    );
    expect(isMarketClosedOn({ assetClass: ASSET_CLASS.stocks, date: INDIAN_HOLIDAY, exchangeAcronym: 'NYSE' })).toBe(
      false,
    );
  });
});

describe('partitionByMarketStatus', () => {
  it('splits a mixed list on a weekend', () => {
    const items = [
      { symbol: 'AAPL', assetClass: ASSET_CLASS.stocks, exchangeAcronym: 'NASDAQ' },
      { symbol: 'BTC-USD', assetClass: ASSET_CLASS.crypto },
      { symbol: 'XTB.WA', assetClass: ASSET_CLASS.stocks, exchangeAcronym: 'GPW' },
      { symbol: 'ETH-EUR', assetClass: ASSET_CLASS.crypto },
      { symbol: 'BOND.GOV', assetClass: ASSET_CLASS.fixed_income },
    ];

    const result = partitionByMarketStatus({ items, date: SATURDAY });

    expect(result.expectedClosed.map((i) => i.symbol)).toEqual(['AAPL', 'XTB.WA', 'BOND.GOV']);
    expect(result.actuallyMissing.map((i) => i.symbol)).toEqual(['BTC-USD', 'ETH-EUR']);
  });

  it('splits list containing holiday exchanges on a weekday', () => {
    // US Holiday: July 3, 2026 (Friday)
    const US_HOLIDAY = new Date(2026, 6, 3, 12, 0, 0);
    const items = [
      { symbol: 'AAPL', assetClass: ASSET_CLASS.stocks, exchangeAcronym: 'NASDAQ' },
      { symbol: 'BTC-USD', assetClass: ASSET_CLASS.crypto },
      { symbol: 'XTB.WA', assetClass: ASSET_CLASS.stocks, exchangeAcronym: 'GPW' },
    ];

    const result = partitionByMarketStatus({ items, date: US_HOLIDAY });

    expect(result.expectedClosed.map((i) => i.symbol)).toEqual(['AAPL']);
    expect(result.actuallyMissing.map((i) => i.symbol)).toEqual(['BTC-USD', 'XTB.WA']);
  });

  it('treats everything as actually-missing on a weekday', () => {
    const items = [
      { symbol: 'AAPL', assetClass: ASSET_CLASS.stocks },
      { symbol: 'BTC-USD', assetClass: ASSET_CLASS.crypto },
    ];

    const result = partitionByMarketStatus({ items, date: MONDAY });

    expect(result.expectedClosed).toEqual([]);
    expect(result.actuallyMissing.map((i) => i.symbol)).toEqual(['AAPL', 'BTC-USD']);
  });

  it('handles empty input', () => {
    const result = partitionByMarketStatus({ items: [], date: SATURDAY });
    expect(result.expectedClosed).toEqual([]);
    expect(result.actuallyMissing).toEqual([]);
  });
});
