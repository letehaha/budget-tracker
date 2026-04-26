/**
 * Time-Weighted Return — strips out the timing impact of deposits/withdrawals.
 *
 * Inputs are the portfolio's value at the boundary of each sub-period and the
 * external cash flow that occurs at that boundary. The standard convention used
 * here: each segment runs from `points[i]` to `points[i+1]`. The cash flow at
 * `points[i+1]` is treated as occurring *after* market value was observed, so
 *
 *   r_i = (V_{i+1} - CF_{i+1}) / V_i      when V_i > 0
 *
 * Cumulative TWR = Π(1 + r_i) − 1.
 * Annualized = (1 + TWR)^(365 / totalDays) − 1.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface TwrPoint {
  date: Date | string;
  /** Portfolio value (in base currency) observed at this date. */
  value: number;
  /**
   * External cash flow at this date — positive = deposit (cash in),
   * negative = withdrawal (cash out). For the first point this is ignored
   * because there is no prior segment; the first point's `value` is treated
   * as the opening capital.
   */
  cashFlow: number;
}

interface TwrResult {
  cumulativeReturn: number;
  annualizedReturn: number | null;
  /** Number of segments that actually contributed to the product. */
  segmentsUsed: number;
}

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

/**
 * Compute the time-weighted return from a sequence of valuation/cash-flow snapshots.
 *
 * Returns null annualizedReturn when the period is degenerate (zero days or
 * a segment had zero/negative starting value, which makes a return undefined).
 */
export const calculateTwr = ({ points }: { points: TwrPoint[] }): TwrResult | null => {
  if (points.length < 2) return null;

  const sorted = points.toSorted((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());

  let product = 1;
  let segmentsUsed = 0;

  for (let i = 1; i < sorted.length; i++) {
    const start = sorted[i - 1]!;
    const end = sorted[i]!;
    if (start.value <= 0) {
      // Cannot define a return when starting capital is zero — skip but keep going.
      // E.g. portfolio that opens fresh at point i with the deposit at i.
      continue;
    }
    const segmentReturn = (end.value - end.cashFlow - start.value) / start.value;
    product *= 1 + segmentReturn;
    segmentsUsed += 1;
  }

  const cumulativeReturn = product - 1;

  const firstDate = toDate(sorted[0]!.date).getTime();
  const lastDate = toDate(sorted[sorted.length - 1]!.date).getTime();
  const totalDays = (lastDate - firstDate) / MS_PER_DAY;

  let annualizedReturn: number | null = null;
  if (totalDays > 0 && product > 0) {
    annualizedReturn = Math.pow(product, 365 / totalDays) - 1;
  }

  return { cumulativeReturn, annualizedReturn, segmentsUsed };
};
