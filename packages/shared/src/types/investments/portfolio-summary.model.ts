export interface PortfolioSummaryModel {
  portfolioId: number;
  portfolioName: string;
  totalCurrentValue: string;
  totalCostBasis: string;
  unrealizedGainValue: string;
  unrealizedGainPercent: string;
  realizedGainValue: string;
  realizedGainPercent: string;
  currencyCode: string;
  totalCashInBaseCurrency: string;
  availableCashInBaseCurrency: string;
  totalPortfolioValue: string;
}
