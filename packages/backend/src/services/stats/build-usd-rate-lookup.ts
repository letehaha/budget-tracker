import ExchangeRates from '@models/exchange-rates.model';
import { API_LAYER_BASE_CURRENCY_CODE } from '@services/exchange-rates/constants';
import { format, parseISO, startOfDay } from 'date-fns';
import { Op } from 'sequelize';

const formatDate = (date: Date | string): string => format(date, 'yyyy-MM-dd');

type UsdRateRow = Pick<ExchangeRates, 'quoteCode' | 'date' | 'rate'>;

interface UsdRateLookup {
  /** `${quoteCode}_${yyyy-MM-dd}` -> `1 USD = N quoteCode`. */
  usdRatesMap: Map<string, number>;
  /** quoteCode -> ascending yyyy-MM-dd dates present in `usdRatesMap`. */
  usdRateDatesByQuote: Map<string, string[]>;
}

/**
 * Build the USD-pivot rate lookup the balance-history walkers use, seeded with one
 * "last known" anchor per currency from strictly BEFORE the chart window.
 *
 * Balance-history readers preload system rates only within `[windowStart, windowEnd]`.
 * A currency whose most recent stored rate predates `windowStart` then has zero rows in
 * the lookup, so the per-day backward walk (`findLatestUsdRate`) finds nothing and the
 * caller silently collapses that currency's value to a wrong 1:1 — e.g. a USD asset on
 * a base whose rate stopped updating reads ~40x off. Querying the single latest rate
 * before `windowStart` per currency gives the walk a valid prior rate to carry forward.
 * (A currency with no stored rate anywhere is still absent here — that is a
 * rate-coverage gap upstream, not a read-path bug.)
 *
 * `systemRates` MUST already be sorted ascending by date within each quoteCode (the
 * callers order their query by quoteCode, date ASC). Pre-window anchors are inserted
 * first so each quote's date list stays globally ascending, which `findLatestUsdRate`
 * relies on for its backward walk.
 */
export const buildUsdRateLookup = async ({
  systemRates,
  quoteCodes,
  windowStart,
}: {
  systemRates: UsdRateRow[];
  quoteCodes: string[];
  /** yyyy-MM-dd — inclusive lower bound of the preloaded window. */
  windowStart: string;
}): Promise<UsdRateLookup> => {
  const anchorCodes = quoteCodes.filter((code) => code !== API_LAYER_BASE_CURRENCY_CODE);

  const preWindowAnchors = anchorCodes.length
    ? (
        await Promise.all(
          anchorCodes.map((quoteCode) =>
            ExchangeRates.findOne({
              where: {
                baseCode: API_LAYER_BASE_CURRENCY_CODE,
                quoteCode,
                date: { [Op.lt]: startOfDay(parseISO(windowStart)) },
              },
              order: [['date', 'DESC']],
              attributes: ['quoteCode', 'date', 'rate'],
              raw: true,
            }),
          ),
        )
      ).filter((row): row is ExchangeRates => row !== null)
    : [];

  const usdRatesMap = new Map<string, number>();
  const usdRateDatesByQuote = new Map<string, string[]>();

  // Anchors first (each strictly older than every in-window date), then the in-window
  // rows in ascending date order — keeps each quote's date list ascending.
  for (const row of [...preWindowAnchors, ...systemRates]) {
    const dateStr = formatDate(row.date);
    usdRatesMap.set(`${row.quoteCode}_${dateStr}`, row.rate);

    const dates = usdRateDatesByQuote.get(row.quoteCode);
    if (dates) dates.push(dateStr);
    else usdRateDatesByQuote.set(row.quoteCode, [dateStr]);
  }

  return { usdRatesMap, usdRateDatesByQuote };
};
