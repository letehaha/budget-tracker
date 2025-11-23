/**
 * Banker's rounding (round half to even) - IEEE 754 standard
 * When a number is exactly halfway between two integers, round to the nearest even number.
 * This minimizes cumulative bias in financial calculations.
 *
 * Examples:
 * - 0.5 → 0 (even)
 * - 1.5 → 2 (even)
 * - 2.5 → 2 (even)
 * - 3.5 → 4 (even)
 */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;

  // If not exactly at 0.5, use normal rounding
  if (fraction !== 0.5) {
    return Math.round(value);
  }

  // At exactly 0.5, round to nearest even number
  return floor % 2 === 0 ? floor : floor + 1;
}
