import { ASSET_CLASS } from '@bt/shared/types/investments';
import { describe, expect, it } from 'vitest';

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
});

describe('partitionByMarketStatus', () => {
  it('splits a mixed list on a weekend', () => {
    const items = [
      { symbol: 'AAPL', assetClass: ASSET_CLASS.stocks },
      { symbol: 'BTC-USD', assetClass: ASSET_CLASS.crypto },
      { symbol: 'XTB.WA', assetClass: ASSET_CLASS.stocks },
      { symbol: 'ETH-EUR', assetClass: ASSET_CLASS.crypto },
      { symbol: 'BOND.GOV', assetClass: ASSET_CLASS.fixed_income },
    ];

    const result = partitionByMarketStatus({ items, date: SATURDAY });

    expect(result.expectedClosed.map((i) => i.symbol)).toEqual(['AAPL', 'XTB.WA', 'BOND.GOV']);
    expect(result.actuallyMissing.map((i) => i.symbol)).toEqual(['BTC-USD', 'ETH-EUR']);
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
