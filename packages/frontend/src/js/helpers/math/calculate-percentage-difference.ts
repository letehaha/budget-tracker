/**
 * Calculates the percentage change from value `b` (previous) to value `a` (current).
 * Uses the standard formula: ((current - previous) / |previous|) * 100
 *
 * @param _a - Current value
 * @param _b - Previous value (base for comparison)
 * @returns Percentage change (can exceed ±100%)
 */
export function calculatePercentageDifference(_a: number, _b: number): number {
  const a = Number.isNaN(_a) || !Number.isFinite(_a) ? 0 : _a;
  const b = Number.isNaN(_b) || !Number.isFinite(_b) ? 0 : _b;

  // If both numbers are zero, there's no difference
  if (a === 0 && b === 0) {
    return 0;
  }

  // If previous value is zero and current isn't, it's a 100% increase
  if (b === 0) {
    return a > 0 ? 100 : -100;
  }

  // If current value is zero, it's a 100% decrease
  if (a === 0) {
    return -100;
  }

  // Standard percentage change formula: ((current - previous) / |previous|) * 100
  const percent = ((a - b) / Math.abs(b)) * 100;
  return percent;
}
