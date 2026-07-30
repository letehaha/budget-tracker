import { Money } from '@common/types/money';

export interface DemoContributionConfig {
  /** Days before the reference date the cash left the savings account. */
  daysAgo: number;
  /**
   * Fraction of the portfolio's total funding this deposit covers, or `null`
   * for "whatever is still missing". Exactly one entry per portfolio may be
   * null: it absorbs the difference so the funding always adds up to the buys
   * plus the ending cash balance.
   *
   * Fractions rather than dollar amounts because demo holdings are priced from
   * whatever the market did — a fixed $6,500 deposit stops covering 0.15 BTC
   * the moment bitcoin doubles, and the placeholder entry below then has
   * nothing left to absorb.
   */
  share: number | null;
  description: string;
}

export interface ContributionPlan {
  daysAgo: number;
  amount: Money;
  description: string;
}

/**
 * Resolves the placeholder entry so the portfolio's funding equals its buys plus
 * its ending cash. Without that equality the ending `PortfolioBalances` row would
 * contradict the transfers the contributions report sums.
 */
export function resolveContributions({
  contributions,
  totalNeeded,
}: {
  contributions: DemoContributionConfig[];
  totalNeeded: Money;
}): ContributionPlan[] {
  // Resolved before summing so the placeholder absorbs the rounding of every
  // share, keeping the transfers exactly equal to the balance row.
  const resolved = contributions.map((item) => ({
    daysAgo: item.daysAgo,
    amount: item.share === null ? null : totalNeeded.multiply(item.share),
    description: item.description,
  }));

  const fixedTotal = Money.sum(resolved.flatMap((item) => (item.amount === null ? [] : [item.amount])));
  const remainder = totalNeeded.subtract(fixedTotal);

  if (!remainder.isPositive()) {
    throw new Error(
      `Demo investments: fixed contributions (${fixedTotal.toString()}) leave nothing for the placeholder entry (funding needed: ${totalNeeded.toString()})`,
    );
  }

  return resolved.map((item) => ({
    daysAgo: item.daysAgo,
    amount: item.amount ?? remainder,
    description: item.description,
  }));
}
