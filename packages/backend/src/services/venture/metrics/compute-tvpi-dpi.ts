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
