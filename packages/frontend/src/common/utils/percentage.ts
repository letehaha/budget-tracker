/**
 * Conversion helpers between **fractions** (the stored representation, e.g. `0.085`)
 * and **percent strings** (the user-facing representation, e.g. `"8.5"` or `"8.5%"`).
 * The API and DB always use fractions; UI inputs and display always use percent.
 */

interface FormatFractionAsPercentOptions {
  /** Max fraction digits when not stripping trailing zeros. Default 2. */
  maximumFractionDigits?: number;
  /** When true, drop trailing zeros (e.g. `"8.5%"` not `"8.50%"`). Default true. */
  stripTrailingZeros?: boolean;
  /** String returned when the input is null/undefined/non-finite. Default `"—"`. */
  fallback?: string;
}

/**
 * Format a stored fraction as a percent display string.
 * Example: `formatFractionAsPercent("0.085")` → `"8.5%"`.
 */
export function formatFractionAsPercent(
  fraction: string | number | null | undefined,
  options: FormatFractionAsPercentOptions = {},
): string {
  const { maximumFractionDigits = 2, stripTrailingZeros = true, fallback = '—' } = options;
  if (fraction === null || fraction === undefined) return fallback;
  const num = typeof fraction === 'number' ? fraction : Number(fraction);
  if (!Number.isFinite(num)) return fallback;
  const formatted = (num * 100).toFixed(maximumFractionDigits);
  const trimmed = stripTrailingZeros ? formatted.replace(/\.?0+$/, '') : formatted;
  return `${trimmed}%`;
}

/**
 * Convert a stored fraction into the value used by a percent text input.
 * Example: `fractionToPercentInput("0.085")` → `"8.5"`. Falls back to `"0"`
 * for non-finite inputs so form state stays a valid string.
 */
export function fractionToPercentInput(fraction: string | number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '0';
  const num = typeof fraction === 'number' ? fraction : Number(fraction);
  if (!Number.isFinite(num)) return '0';
  return (num * 100).toString();
}

/**
 * Convert a percent text input value back into the stored fraction.
 * Example: `percentInputToFraction("8.5")` → `"0.085"`. Falls back to `"0"`
 * for non-finite inputs so the payload stays a valid decimal string.
 */
export function percentInputToFraction(percentInput: string | number | null | undefined): string {
  if (percentInput === null || percentInput === undefined) return '0';
  const num = typeof percentInput === 'number' ? percentInput : Number(percentInput);
  if (!Number.isFinite(num)) return '0';
  return (num / 100).toString();
}

/**
 * True when `val` parses to a finite number in the inclusive range [0, 100].
 * Use to validate percent-text inputs (entry fee, carry, hurdle, etc.).
 */
export function isPercentInputValid(val: string): boolean {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}
