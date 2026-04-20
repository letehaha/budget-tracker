interface MarketIndicator {
  id: string;
  label: string;
  avgAnnualReturn: number;
}

export const CUSTOM_INDICATOR_ID = 'custom';

export const MARKET_INDICATORS: MarketIndicator[] = [
  { id: 'sp500', label: 'S&P 500', avgAnnualReturn: 10 },
  { id: 'nasdaq', label: 'NASDAQ Composite', avgAnnualReturn: 12 },
  { id: 'djia', label: 'Dow Jones', avgAnnualReturn: 7.5 },
  { id: 'world-stock', label: 'Total World Stock', avgAnnualReturn: 8 },
  { id: 'us-treasury', label: 'US Treasury Bonds', avgAnnualReturn: 5 },
  { id: 'corporate-bonds', label: 'Corporate Bonds', avgAnnualReturn: 6 },
];

export const getIndicatorById = ({ id }: { id: string }): MarketIndicator | undefined =>
  MARKET_INDICATORS.find((i) => i.id === id);
