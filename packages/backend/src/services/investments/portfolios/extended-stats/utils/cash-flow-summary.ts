/**
 * Cash-flow summary helpers for the portfolio extended-stats endpoint.
 *
 * Inputs are normalized rows already in the user's base currency (refAmount).
 * The two callers fetch PortfolioTransfer and InvestmentTransaction rows and
 * shape them into the simple types here.
 *
 * "Portfolio age" runs from whichever came first: the first deposit or the
 * first security purchase. Withdrawals and dividends don't mark the start.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_AVG_MONTH = 365 / 12;

export type ExternalFlowDirection = 'deposit' | 'withdrawal';

export interface ExternalCashFlow {
  date: Date | string;
  direction: ExternalFlowDirection;
  amount: number; // base currency, always positive
}

export interface DividendFlow {
  date: Date | string;
  amount: number; // base currency, always positive
}

interface CashFlowSummary {
  totalDeposits: number;
  totalWithdrawals: number;
  netInvested: number;
  totalDividends: number;
  /**
   * Trailing-12-month dividends ÷ 12 when the portfolio is at least 12 months old.
   * Falls back to total dividends ÷ months since the start of the portfolio.
   * Null if there's no portfolio start date or no dividends.
   */
  averageMonthlyDividends: number | null;
  /**
   * ISO YYYY-MM-DD of the earliest of: first deposit or first buy transaction.
   * Null if the portfolio has neither.
   */
  firstTransactionDate: string | null;
  /** Days between `firstTransactionDate` and `referenceDate`, or null. */
  portfolioAgeDays: number | null;
}

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

const toIsoDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Sum and shape the cash-flow numbers needed for the extended-stats endpoint.
 *
 * @param externalFlows deposits + withdrawals (PortfolioTransfer rows)
 * @param dividends dividend investment-transactions
 * @param referenceDate "now" — used as the upper bound for trailing-12mo and age
 * @param firstBuyDate the date of the earliest buy transaction; null if none
 */
export const summarizeCashFlows = ({
  externalFlows,
  dividends,
  referenceDate,
  firstBuyDate,
}: {
  externalFlows: ExternalCashFlow[];
  dividends: DividendFlow[];
  referenceDate: Date;
  firstBuyDate: Date | null;
}): CashFlowSummary => {
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let firstDepositDate: Date | null = null;
  for (const f of externalFlows) {
    if (f.direction === 'deposit') {
      totalDeposits += f.amount;
      const d = toDate(f.date);
      if (firstDepositDate === null || d < firstDepositDate) firstDepositDate = d;
    } else {
      totalWithdrawals += f.amount;
    }
  }

  let totalDividends = 0;
  for (const d of dividends) totalDividends += d.amount;

  // Portfolio start = earliest of (first deposit, first buy).
  const portfolioStart = earliest({ a: firstDepositDate, b: firstBuyDate });
  let firstTransactionDate: string | null = null;
  let portfolioAgeDays: number | null = null;
  if (portfolioStart) {
    firstTransactionDate = toIsoDate(portfolioStart);
    portfolioAgeDays = Math.max(0, Math.floor((referenceDate.getTime() - portfolioStart.getTime()) / MS_PER_DAY));
  }

  const averageMonthlyDividends = computeAverageMonthlyDividends({ dividends, referenceDate, portfolioAgeDays });

  return {
    totalDeposits,
    totalWithdrawals,
    netInvested: totalDeposits - totalWithdrawals,
    totalDividends,
    averageMonthlyDividends,
    firstTransactionDate,
    portfolioAgeDays,
  };
};

const earliest = ({ a, b }: { a: Date | null; b: Date | null }): Date | null => {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
};

const computeAverageMonthlyDividends = ({
  dividends,
  referenceDate,
  portfolioAgeDays,
}: {
  dividends: DividendFlow[];
  referenceDate: Date;
  portfolioAgeDays: number | null;
}): number | null => {
  if (dividends.length === 0 || portfolioAgeDays === null) return null;

  // Portfolio at least 12 months old → trailing-12mo run rate.
  if (portfolioAgeDays >= 365) {
    const cutoff = referenceDate.getTime() - 365 * MS_PER_DAY;
    let trailing = 0;
    for (const d of dividends) {
      if (toDate(d.date).getTime() >= cutoff) trailing += d.amount;
    }
    return trailing / 12;
  }

  // Younger portfolio → lifetime average over actual age in months (min 1mo).
  const months = Math.max(1, portfolioAgeDays / DAYS_PER_AVG_MONTH);
  let total = 0;
  for (const d of dividends) total += d.amount;
  return total / months;
};
