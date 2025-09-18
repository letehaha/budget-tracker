export interface PortfolioGainsResult {
  totalCurrentValue: number;
  totalCostBasis: number;
  unrealizedGainValue: number;
  unrealizedGainPercent: number;
  realizedGainValue: number;
  realizedGainPercent: number;
}

export interface HoldingForPortfolioGains {
  marketValue: number;
  costBasis: number;
  unrealizedGainValue: number;
  unrealizedGainPercent: number;
  realizedGainValue: number;
  realizedGainPercent: number;
}

/**
 * Calculate portfolio-level gains/losses from individual holdings
 * @param holdings Array of holdings with their individual gain/loss calculations
 * @returns Portfolio-wide gains/losses aggregated across all holdings
 */
export function calculatePortfolioGains(holdings: HoldingForPortfolioGains[]): PortfolioGainsResult {
  if (holdings.length === 0) {
    return {
      totalCurrentValue: 0,
      totalCostBasis: 0,
      unrealizedGainValue: 0,
      unrealizedGainPercent: 0,
      realizedGainValue: 0,
      realizedGainPercent: 0,
    };
  }

  // Sum up the portfolio totals
  let totalCurrentValue = 0;
  let totalCostBasis = 0;
  let totalUnrealizedGainValue = 0;
  let totalRealizedGainValue = 0;
  let totalRealizedCostBasis = 0; // For calculating portfolio-wide realized gain percentage

  for (const holding of holdings) {
    totalCurrentValue += holding.marketValue;
    totalCostBasis += holding.costBasis;
    totalUnrealizedGainValue += holding.unrealizedGainValue;
    totalRealizedGainValue += holding.realizedGainValue;

    // For realized percentage, we need the cost basis of shares that were sold
    // We can estimate this from the realized gain and percentage
    if (holding.realizedGainPercent !== 0) {
      const costBasisOfSoldShares = Math.abs(holding.realizedGainValue / (holding.realizedGainPercent / 100));
      totalRealizedCostBasis += costBasisOfSoldShares;
    }
  }

  // Calculate portfolio-wide percentages
  const unrealizedGainPercent = totalCostBasis > 0 ? (totalUnrealizedGainValue / totalCostBasis) * 100 : 0;

  const realizedGainPercent = totalRealizedCostBasis > 0 ? (totalRealizedGainValue / totalRealizedCostBasis) * 100 : 0;

  return {
    totalCurrentValue,
    totalCostBasis,
    unrealizedGainValue: totalUnrealizedGainValue,
    unrealizedGainPercent,
    realizedGainValue: totalRealizedGainValue,
    realizedGainPercent,
  };
}
