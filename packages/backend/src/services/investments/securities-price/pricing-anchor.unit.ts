import { SECURITY_PROVIDER } from '@bt/shared/types';

import { PriceData, toProviderSymbol } from '../data-providers/base-provider';
import { bucketByUtcDay, startOfDayUtc } from './pricing-anchor';

const point = ({ iso, close = 1 }: { iso: string; close?: number }): PriceData => ({
  providerSymbol: toProviderSymbol('TEST'),
  date: new Date(iso),
  priceClose: close,
  priceAsOf: new Date(iso),
  providerName: SECURITY_PROVIDER.yahoo,
});

describe('startOfDayUtc', () => {
  it('truncates any intraday timestamp to midnight UTC of the same UTC day', () => {
    expect(startOfDayUtc(new Date('2026-08-27T15:35:59.123Z')).toISOString()).toBe('2026-08-27T00:00:00.000Z');
  });

  it('leaves midnight UTC unchanged', () => {
    expect(startOfDayUtc(new Date('2026-08-27T00:00:00.000Z')).toISOString()).toBe('2026-08-27T00:00:00.000Z');
  });
});

describe('bucketByUtcDay', () => {
  it('returns empty for empty input', () => {
    expect(bucketByUtcDay([])).toEqual([]);
  });

  it('collapses same-UTC-day points to one midnight row, latest timestamp wins', () => {
    const rows = bucketByUtcDay([
      point({ iso: '2026-08-27T06:00:00Z', close: 100 }),
      point({ iso: '2026-08-27T22:00:00Z', close: 103 }),
      point({ iso: '2026-08-27T14:00:00Z', close: 101 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.date.toISOString()).toBe('2026-08-27T00:00:00.000Z');
    expect(rows[0]!.priceClose).toBe(103);
  });

  it('splits points on either side of midnight UTC into separate days', () => {
    const rows = bucketByUtcDay([
      point({ iso: '2026-08-27T23:59:59Z', close: 100 }),
      point({ iso: '2026-08-28T00:01:00Z', close: 200 }),
    ]);

    expect(rows.map((r) => r.date.toISOString()).toSorted()).toEqual([
      '2026-08-27T00:00:00.000Z',
      '2026-08-28T00:00:00.000Z',
    ]);
  });

  it('keeps the first point on an exact timestamp tie', () => {
    const rows = bucketByUtcDay([
      point({ iso: '2026-08-27T12:00:00Z', close: 100 }),
      point({ iso: '2026-08-27T12:00:00Z', close: 999 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.priceClose).toBe(100);
  });

  it('buckets by UTC day, not exchange-local day: a Sydney session opening 23:00 UTC lands on the previous UTC day', () => {
    const rows = bucketByUtcDay([point({ iso: '2026-08-28T23:00:00Z', close: 50 })]);

    expect(rows[0]!.date.toISOString()).toBe('2026-08-28T00:00:00.000Z');
  });

  it('preserves extra fields on subtypes (BulkPriceData securityId survives the spread)', () => {
    const rows = bucketByUtcDay([{ ...point({ iso: '2026-08-27T12:00:00Z' }), securityId: 'sec-1' }]);

    expect(rows[0]!.securityId).toBe('sec-1');
  });
});
