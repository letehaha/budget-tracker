import { Money } from '@common/types/money';

export interface DemoContributionConfig {
  /** Days before the reference date the cash left the savings account. */
  daysAgo: number;
  /**
   * Whole-dollar amount, or `null` for "whatever is still missing". Exactly one
   * entry per portfolio may be null: it absorbs the difference so the funding
   * always adds up to the buys plus the ending cash balance.
   */
  amount: number | null;
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
  const fixedTotal = Money.sum(
    contributions.flatMap((item) => (item.amount === null ? [] : [Money.fromDecimal(item.amount)])),
  );
  const remainder = totalNeeded.subtract(fixedTotal);

  if (!remainder.isPositive()) {
    throw new Error(
      `Demo investments: fixed contributions (${fixedTotal.toString()}) leave nothing for the placeholder entry (funding needed: ${totalNeeded.toString()})`,
    );
  }

  return contributions.map((item) => ({
    daysAgo: item.daysAgo,
    amount: item.amount === null ? remainder : Money.fromDecimal(item.amount),
    description: item.description,
  }));
}
