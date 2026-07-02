import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';

import { buildPriceLookup, createFindPriceForDate } from './security-price-lookup';

type PriceLike = Parameters<typeof buildPriceLookup>[0][number];

const priceRow = ({
  securityId,
  date,
  priceClose,
}: {
  securityId: string;
  date: Date;
  priceClose: number;
}): PriceLike => ({ securityId, date, priceClose: Money.fromDecimal(priceClose) }) as PriceLike;

describe('buildPriceLookup', () => {
  it('returns empty maps for an empty input', () => {
    const lookup = buildPriceLookup([]);
    expect(lookup.pricesBySecurity.size).toBe(0);
    expect(lookup.pricesBySecurityAndDate.size).toBe(0);
  });

  it('indexes a single price by `${securityId}_${yyyy-MM-dd}`', () => {
    const lookup = buildPriceLookup([priceRow({ securityId: 'sec-1', date: new Date('2024-05-10'), priceClose: 100 })]);
    expect(lookup.pricesBySecurityAndDate.get('sec-1_2024-05-10')).toBe(100);
    expect(lookup.pricesBySecurity.get('sec-1')).toEqual([{ date: '2024-05-10', price: 100 }]);
  });

  it('collapses multiple intraday rows onto a single daily bucket with last-write wins', () => {
    // Simulates crypto intraday data with two SecurityPricing rows on the
    // same UTC day; the loader sorts ASC by date so the later timestamp wins.
    const lookup = buildPriceLookup([
      priceRow({ securityId: 'btc', date: new Date('2024-05-10T06:00:00Z'), priceClose: 50000 }),
      priceRow({ securityId: 'btc', date: new Date('2024-05-10T22:00:00Z'), priceClose: 67000 }),
    ]);
    expect(lookup.pricesBySecurityAndDate.get('btc_2024-05-10')).toBe(67000);
  });
});

describe('createFindPriceForDate', () => {
  it('returns null when the security has no prices at all', () => {
    const find = createFindPriceForDate(buildPriceLookup([]));
    expect(find('sec-1', '2024-05-10')).toBeNull();
  });

  it('returns the exact-day price when present', () => {
    const find = createFindPriceForDate(
      buildPriceLookup([priceRow({ securityId: 'sec-1', date: new Date('2024-05-10'), priceClose: 100 })]),
    );
    expect(find('sec-1', '2024-05-10')).toBe(100);
  });

  it('walks back to the most recent prior price for missing days (weekends/holidays)', () => {
    const find = createFindPriceForDate(
      buildPriceLookup([
        priceRow({ securityId: 'sec-1', date: new Date('2024-05-10'), priceClose: 100 }),
        priceRow({ securityId: 'sec-1', date: new Date('2024-05-13'), priceClose: 105 }),
      ]),
    );
    // 2024-05-11 (Sat) and 2024-05-12 (Sun) have no rows; fall back to Friday.
    expect(find('sec-1', '2024-05-11')).toBe(100);
    expect(find('sec-1', '2024-05-12')).toBe(100);
    expect(find('sec-1', '2024-05-13')).toBe(105);
  });

  it('returns null when every stored date is strictly after the target', () => {
    const find = createFindPriceForDate(
      buildPriceLookup([
        priceRow({ securityId: 'sec-1', date: new Date('2024-05-10'), priceClose: 100 }),
        priceRow({ securityId: 'sec-1', date: new Date('2024-05-13'), priceClose: 105 }),
      ]),
    );
    expect(find('sec-1', '2024-04-30')).toBeNull();
  });

  it('isolates prices per security', () => {
    const find = createFindPriceForDate(
      buildPriceLookup([
        priceRow({ securityId: 'aapl', date: new Date('2024-05-10'), priceClose: 200 }),
        priceRow({ securityId: 'btc', date: new Date('2024-05-10'), priceClose: 67000 }),
      ]),
    );
    expect(find('aapl', '2024-05-10')).toBe(200);
    expect(find('btc', '2024-05-10')).toBe(67000);
    expect(find('eth', '2024-05-10')).toBeNull();
  });
});
