export interface PortfolioSummaryModel {
  portfolioId: string;
  portfolioName: string;
  /** Denominated in `currencyCode`. */
  totalCurrentValue: string;
  /** Denominated in `currencyCode`. */
  totalCostBasis: string;
  /** Denominated in `currencyCode`. */
  unrealizedGainValue: string;
  unrealizedGainPercent: string;
  /** Denominated in `currencyCode`. */
  realizedGainValue: string;
  realizedGainPercent: string;
  /** The portfolio's displayCurrencyCode when set and resolvable, otherwise the user's base currency. */
  currencyCode: string;
  /** Denominated in `currencyCode` (field name predates display currency). */
  totalCashInBaseCurrency: string;
  /** Denominated in `currencyCode` (field name predates display currency). */
  availableCashInBaseCurrency: string;
  /** Holdings value + cash, denominated in `currencyCode`. */
  totalPortfolioValue: string;
  /** User's base currency, regardless of the portfolio's display currency. */
  baseCurrencyCode: string;
  /** Total portfolio value in the user's base currency; equals totalPortfolioValue when no display currency is set. */
  totalPortfolioValueInBaseCurrency: string;
}
