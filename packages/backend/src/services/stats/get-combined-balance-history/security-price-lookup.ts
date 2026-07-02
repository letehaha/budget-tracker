import SecurityPricing from '@models/investments/security-pricing.model';

import { formatDateKey } from './types';

type SecurityPriceRow = Pick<SecurityPricing, 'securityId' | 'date' | 'priceClose'>;

interface PriceLookup {
  /** Per-security ascending-date list, used for the backward walk in `createFindPriceForDate`. */
  pricesBySecurity: Map<string, Array<{ date: string; price: number }>>;
  /** Direct lookup keyed `${securityId}_${dateStr}` — last write wins on intraday collisions. */
  pricesBySecurityAndDate: Map<string, number>;
}

/**
 * Index prices by security and yyyy-MM-dd. `price.date` is TIMESTAMPTZ
 * (crypto carries intraday timestamps); formatting to `yyyy-MM-dd` collapses
 * same-day intraday rows onto a single daily bucket. Rows MUST be sorted
 * ascending by date so the per-security date list stays ordered for the
 * backward walk; last-write-wins on the exact-match map then picks the latest
 * intraday close for that day.
 */
export const buildPriceLookup = (rows: SecurityPriceRow[]): PriceLookup => {
  const pricesBySecurity = new Map<string, Array<{ date: string; price: number }>>();
  const pricesBySecurityAndDate = new Map<string, number>();

  for (const price of rows) {
    const dateStr = formatDateKey(price.date);
    const priceValue = price.priceClose.toNumber();

    if (!pricesBySecurity.has(price.securityId)) {
      pricesBySecurity.set(price.securityId, []);
    }
    pricesBySecurity.get(price.securityId)!.push({ date: dateStr, price: priceValue });
    pricesBySecurityAndDate.set(`${price.securityId}_${dateStr}`, priceValue);
  }

  return { pricesBySecurity, pricesBySecurityAndDate };
};

/**
 * Closure factory: returns the price for `securityId` on `targetDate`, falling
 * back to the latest known prior price (handles weekends, holidays, sparse
 * coverage). Returns `null` when no price is on or before the target date.
 */
export const createFindPriceForDate = ({ pricesBySecurity, pricesBySecurityAndDate }: PriceLookup) => {
  return (securityId: string, targetDate: string): number | null => {
    const exactPrice = pricesBySecurityAndDate.get(`${securityId}_${targetDate}`);
    if (exactPrice !== undefined) return exactPrice;

    const prices = pricesBySecurity.get(securityId);
    if (!prices || prices.length === 0) return null;

    let lastValidPrice: number | null = null;
    for (const p of prices) {
      if (p.date <= targetDate) {
        lastValidPrice = p.price;
      } else {
        break;
      }
    }
    return lastValidPrice;
  };
};
