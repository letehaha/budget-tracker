import type { Money } from '@common/types/money';
import SecurityPricing from '@models/investments/security-pricing.model';
import { parseISO, startOfDay } from 'date-fns';
import { Op } from 'sequelize';

import { buildPriceLookup } from './security-price-lookup';

// Callers fetch these `raw: true` (no Money hydration), so priceClose arrives as a
// raw DECIMAL string; Money stays allowed for hydrated callers, matching what
// `buildPriceLookup` accepts.
type SecurityPriceRow = Pick<SecurityPricing, 'securityId' | 'date'> & {
  priceClose: Money | string;
};

/**
 * Keep the single latest pre-window close per security. `rows` MUST arrive sorted
 * securityId ASC, date DESC, so the first row seen for a security is its latest —
 * later rows for the same security are older and dropped.
 */
export const selectLatestPreWindowAnchors = <T extends { securityId: string }>(rows: T[]): T[] => {
  const anchors: T[] = [];
  const seenSecurities = new Set<string>();
  for (const row of rows) {
    if (seenSecurities.has(row.securityId)) continue;
    seenSecurities.add(row.securityId);
    anchors.push(row);
  }
  return anchors;
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
  // Single query for every pre-window row across all securities, then keep the
  // latest per securityId in JS. One findOne-per-security Promise.all here would
  // fan out into N parallel `pg.connect` spans that Sentry's detector flags as N+1.
  const preWindowRows = securityIds.length
    ? ((await SecurityPricing.findAll({
        where: {
          securityId: { [Op.in]: securityIds },
          date: { [Op.lt]: startOfDay(parseISO(windowStart)) },
        },
        order: [
          ['securityId', 'ASC'],
          ['date', 'DESC'],
        ],
        attributes: ['securityId', 'date', 'priceClose'],
        raw: true,
      })) as SecurityPriceRow[])
    : [];

  // First row per securityId is the latest pre-window close (rows are sorted by
  // securityId ASC, date DESC).
  const preWindowAnchors = selectLatestPreWindowAnchors(preWindowRows);

  // Anchors first (each strictly older than every in-window date), then the
  // in-window rows in ascending date order — keeps each security's date list
  // ascending, and leaves the in-window rows to win the exact-date map.
  return buildPriceLookup([...preWindowAnchors, ...windowPrices]);
};
