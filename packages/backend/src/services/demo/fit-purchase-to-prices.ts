/** One row of a security's price series, ascending by date. */
interface DemoPricePoint {
  date: Date;
  price: number;
}

/**
 * Picks the day a demo purchase should land on, given the prices that actually
 * exist for that security.
 *
 * The demo asks for a purchase N days back, but a real series only reaches as
 * far as its provider's backfill window (CoinGecko's free tier stops at one
 * year). Buying on a day with no price leaves the holding valued at cost basis
 * for every bucket before the first real row, which draws the flat-then-cliff
 * line on the net-worth chart.
 *
 * Resolution always moves the purchase *later*, never earlier, so the funding
 * transfers that precede it in `DEMO_PORTFOLIO_PLANS` still land first.
 */
export function fitPurchaseToPrices({
  prices,
  targetDate,
}: {
  /** Ascending by date. */
  prices: DemoPricePoint[];
  targetDate: Date;
}): DemoPricePoint | null {
  if (prices.length === 0) return null;

  const onOrAfterTarget = prices.find((point) => point.date.getTime() >= targetDate.getTime());
  if (onOrAfterTarget) return onOrAfterTarget;

  // Every row predates the target: the series is stale. Buying on its last day
  // is the only choice that still prices the holding.
  return prices[prices.length - 1]!;
}
