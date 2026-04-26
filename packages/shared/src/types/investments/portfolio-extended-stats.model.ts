export interface PortfolioPerformer {
  securityId: number;
  symbol: string | null;
  name: string | null;
  /** Decimal string in user's base currency (2dp). */
  returnValue: string;
  /** Decimal string of percent return (2dp), e.g. "21.50". */
  returnPercent: string;
}

export interface PortfolioExtendedStatsModel {
  portfolioId: number;
  /** User's base currency code. */
  currencyCode: string;

  // Cash flow / activity (decimal strings in base currency, 2dp)
  totalDeposits: string;
  totalWithdrawals: string;
  netInvested: string;
  totalDividends: string;
  /** Trailing-12mo dividends ÷ 12, or lifetime average for younger portfolios. Null if no dividends. */
  averageMonthlyDividends: string | null;

  /** ISO date (YYYY-MM-DD) of first cash flow or dividend, or null. */
  firstTransactionDate: string | null;
  portfolioAgeDays: number;

  // Performance (annualized %, decimal-string format like "20.50")
  /** Money-weighted return (XIRR). Null when there are too few flows or solver fails. */
  irr: string | null;
  /** Time-weighted return (sub-period TWR), annualized. Null with no external flows. */
  twr: string | null;

  // Best / worst performer (open holdings + each closed cycle)
  bestPerformerByPercent: PortfolioPerformer | null;
  worstPerformerByPercent: PortfolioPerformer | null;
  bestPerformerByValue: PortfolioPerformer | null;
  worstPerformerByValue: PortfolioPerformer | null;

  // Closed positions (FIFO-matched cycles where a holding returned to zero quantity)
  closedPositionsCount: number;
  winningPositionsCount: number;
  /** 0–100, decimal-string formatted to 2dp. */
  winRate: string;
  /** Average gain across closed positions (base currency, 2dp). */
  avgReturnPerClosedPosition: string;
  /** Average gain percent across closed positions (2dp). */
  avgReturnPerClosedPositionPercent: string;
}
