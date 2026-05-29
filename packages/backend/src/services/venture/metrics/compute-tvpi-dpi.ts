import Big from 'big.js';

/**
 * TVPI (Total Value to Paid In) = (currentValue + cumDist) / costBasis.
 * DPI (Distributions to Paid In) = cumDist / costBasis.
 *
 * Returns null when costBasis is 0 (degenerate; metrics undefined).
 */

export function computeTvpi({
  currentValue,
  cumulativeDistributions,
  costBasis,
}: {
  currentValue: string;
  cumulativeDistributions: string;
  costBasis: string;
}): string | null {
  const basis = new Big(costBasis);
  if (basis.eq(0)) return null;
  return new Big(currentValue).plus(cumulativeDistributions).div(basis).toFixed(6);
}

export function computeDpi({
  cumulativeDistributions,
  costBasis,
}: {
  cumulativeDistributions: string;
  costBasis: string;
}): string | null {
  const basis = new Big(costBasis);
  if (basis.eq(0)) return null;
  return new Big(cumulativeDistributions).div(basis).toFixed(6);
}

/**
 * MOIC ≈ TVPI for closed deals — alias for symmetry with the LP statement
 * conventions. Some funds report MOIC = (cumDist + residualValue) / paidIn,
 * which is the same number under our v1 model. Kept as a separate fn so
 * future divergence (e.g., MOIC excludes write-downs) is a single change.
 */
export function computeMoic({
  currentValue,
  cumulativeDistributions,
  costBasis,
}: {
  currentValue: string;
  cumulativeDistributions: string;
  costBasis: string;
}): string | null {
  return computeTvpi({ currentValue, cumulativeDistributions, costBasis });
}
