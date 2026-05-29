export interface PortfolioAnnualizedReturnModel {
  portfolioId: string;
  portfolioName: string;
  /**
   * Annualized time-weighted return as a percentage (e.g. `12.34` = +12.34%/yr).
   * `null` when it cannot be computed (no holdings ever, or not enough history).
   */
  annualizedReturn: number | null;
  /**
   * Whether the tracked history is long enough for the figure to be meaningful.
   * When `false`, `annualizedReturn` is `null` and the UI should present the
   * portfolio as a disabled choice.
   */
  hasEnoughHistory: boolean;
  /** ISO date (`yyyy-MM-dd`) of the first investment transaction, or `null`. */
  startDate: string | null;
  /** Number of days of history the figure is based on. */
  periodDays: number;
  /** User's base currency code (the return is computed in this currency). */
  currencyCode: string;
}
