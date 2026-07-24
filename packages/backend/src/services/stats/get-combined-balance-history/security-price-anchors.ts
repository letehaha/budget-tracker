import type { Money } from '@common/types/money';
import { connection } from '@models/connection';
import SecurityPricing from '@models/investments/security-pricing.model';
import { parseISO, startOfDay } from 'date-fns';
import { QueryTypes } from 'sequelize';

import { buildPriceLookup } from './security-price-lookup';

// Callers fetch these `raw: true` (no Money hydration), so priceClose arrives as a
// raw DECIMAL string; Money stays allowed for hydrated callers, matching what
// `buildPriceLookup` accepts.
type SecurityPriceRow = Pick<SecurityPricing, 'securityId' | 'date'> & {
  priceClose: Money | string;
};

// Raw SQL result: TIMESTAMPTZ comes back as a JS Date, DECIMAL as a string —
// the same shapes a `raw: true` model query produces.
type PreWindowAnchorRow = Pick<SecurityPricing, 'securityId' | 'date'> & {
  priceClose: string;
};

/**
 * Build the security-price lookup the holdings replay reads, seeded with one
 * "last known" anchor per security from strictly BEFORE the preloaded window.
 *
 * Callers preload prices only within `[windowStart, windowEnd]`. A security whose
 * most recent stored price predates `windowStart` then has zero rows in the lookup,
 * so `createFindPriceForDate`'s backward binary-search finds nothing and returns
 * null — the replay values that holding at cost basis instead, and the difference
 * between cost and the last real close reads as a price move the market never made,
 * landing in `priceEffect` and `composition.holdingsValue`. Querying the single
 * latest close before `windowStart` per security gives the search a valid prior
 * price to carry forward. (A security with no stored price anywhere is still absent
 * here — that is a price-coverage gap upstream, not a read-path bug.)
 *
 * `windowPrices` MUST already be sorted ascending by date within each securityId
 * (callers order their query by securityId, date ASC). Anchors are inserted first so
 * each security's date list stays globally ascending, which `buildPriceLookup`
 * requires for the binary search.
 */
export const buildPriceLookupWithPreWindowAnchors = async ({
  windowPrices,
  securityIds,
  windowStart,
}: {
  windowPrices: SecurityPriceRow[];
  securityIds: string[];
  /** yyyy-MM-dd — inclusive lower bound of the preloaded window. */
  windowStart: string;
}): Promise<ReturnType<typeof buildPriceLookup>> => {
  // Only one row per security is ever needed (the latest close before the
  // window), so DISTINCT ON does the per-security top-1 inside Postgres and
  // returns ~N anchor rows regardless of how deep price history goes. A
  // findOne-per-security Promise.all would fan out into N parallel
  // `pg.connect` spans that Sentry's detector flags as N+1.
  const preWindowAnchors = securityIds.length
    ? ((await connection.sequelize.query(
        `
        SELECT DISTINCT ON ("securityId") "securityId", "date", "priceClose"
          FROM "SecurityPricings"
         WHERE "securityId" IN (:securityIds)
           AND "date" < :windowStart
         ORDER BY "securityId", "date" DESC
        `,
        {
          type: QueryTypes.SELECT,
          replacements: {
            securityIds,
            windowStart: startOfDay(parseISO(windowStart)),
          },
        },
      )) as PreWindowAnchorRow[])
    : [];

  // Anchors first (each strictly older than every in-window date), then the
  // in-window rows in ascending date order — keeps each security's date list
  // ascending, and leaves the in-window rows to win the exact-date map.
  return buildPriceLookup([...preWindowAnchors, ...windowPrices]);
};
