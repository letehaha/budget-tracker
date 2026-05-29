interface MarketIndicator {
  id: string;
  label: string;
  avgAnnualReturn: number;
}

export const CUSTOM_INDICATOR_ID = 'custom';

/**
 * Prefix for indicator options backed by one of the user's own portfolios
 * (their tracked historical performance). The portfolio id is appended, e.g.
 * `portfolio:9f3c...`, so it never collides with the static indicator ids.
 */
const PORTFOLIO_INDICATOR_PREFIX = 'portfolio:';

export const makePortfolioIndicatorId = ({ portfolioId }: { portfolioId: string }): string =>
  `${PORTFOLIO_INDICATOR_PREFIX}${portfolioId}`;

export const isPortfolioIndicatorId = ({ id }: { id: string }): boolean => id.startsWith(PORTFOLIO_INDICATOR_PREFIX);

export const getPortfolioIdFromIndicatorId = ({ id }: { id: string }): string =>
  id.slice(PORTFOLIO_INDICATOR_PREFIX.length);

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
