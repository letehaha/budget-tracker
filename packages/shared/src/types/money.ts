/**
 * Branded types for monetary amounts to provide compile-time safety
 * and prevent mixing cents with decimal values.
 *
 * Storage strategy:
 * - DB stores INTEGER cents (amount × 100) for all transactional data
 * - API layer converts to/from DecimalAmount at boundaries
 * - Frontend always works with DecimalAmount
 */

/** Amount stored in cents (integer × 100). Used internally and in DB. */
export type CentsAmount = number & { readonly __brand: 'CentsAmount' };

/** Amount in decimal form (human-readable, e.g., 100.50). Used in API responses and frontend. */
export type DecimalAmount = number & { readonly __brand: 'DecimalAmount' };

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert decimal amount to cents for storage/calculations.
 * Uses Math.round to handle floating point precision issues.
 *
 * @example
 * toCents(asDecimal(100.50)) // => 10050 as CentsAmount
 */
export const toCents = (decimal: DecimalAmount): CentsAmount => Math.round(decimal * 100) as CentsAmount;

/**
 * Convert cents to decimal for display/API responses.
 *
 * @example
 * toDecimal(asCents(10050)) // => 100.50 as DecimalAmount
 */
export const toDecimal = (cents: CentsAmount): DecimalAmount => (cents / 100) as DecimalAmount;

/**
 * Parse a raw numeric API input and convert to cents.
 * Convenience function that combines asDecimal + toCents.
 * Use when processing API request bodies.
 *
 * @example
 * parseToCents(100.50) // => 10050 as CentsAmount
 * parseToCents(req.body.amount) // => converts API input to cents
 */
export const parseToCents = (value: number): CentsAmount => toCents(asDecimal(value));

// ============================================================================
// Type Casting Functions (for boundary values)
// ============================================================================

/**
 * Cast a raw number from DB as CentsAmount.
 * Use when reading INTEGER values from database.
 *
 * @example
 * const amount = asCents(transaction.amount);
 */
export const asCents = (value: number): CentsAmount => value as CentsAmount;

/**
 * Cast a raw number from API request as DecimalAmount.
 * Use when parsing user input or API request bodies.
 *
 * @example
 * const amount = asDecimal(req.body.amount);
 */
export const asDecimal = (value: number): DecimalAmount => value as DecimalAmount;

// ============================================================================
// Arithmetic Helpers (operate in cents to avoid precision issues)
// ============================================================================

/**
 * Add two cent amounts.
 *
 * @example
 * addCents(asCents(1000), asCents(500)) // => 1500 as CentsAmount
 */
export const addCents = (a: CentsAmount, b: CentsAmount): CentsAmount => (a + b) as CentsAmount;

/**
 * Subtract cents: a - b
 *
 * @example
 * subtractCents(asCents(1000), asCents(300)) // => 700 as CentsAmount
 */
export const subtractCents = (a: CentsAmount, b: CentsAmount): CentsAmount => (a - b) as CentsAmount;

/**
 * Multiply cents by a factor (e.g., exchange rate).
 * Result is rounded to nearest cent.
 *
 * @example
 * multiplyCents(asCents(1000), 1.5) // => 1500 as CentsAmount
 */
export const multiplyCents = (cents: CentsAmount, factor: number): CentsAmount =>
  Math.round(cents * factor) as CentsAmount;

/**
 * Negate a cents amount (for expense/income conversion).
 *
 * @example
 * negateCents(asCents(1000)) // => -1000 as CentsAmount
 */
export const negateCents = (cents: CentsAmount): CentsAmount => -cents as CentsAmount;

/**
 * Get absolute value of cents amount.
 *
 * @example
 * absCents(asCents(-1000)) // => 1000 as CentsAmount
 */
export const absCents = (cents: CentsAmount): CentsAmount => Math.abs(cents) as CentsAmount;

// ============================================================================
// Comparison Helpers
// ============================================================================

/**
 * Compare a cents amount against a decimal threshold.
 * Useful for reminder thresholds stored as decimals.
 *
 * @example
 * centsGteDecimal(asCents(10050), asDecimal(100)) // => true (100.50 >= 100)
 */
export const centsGteDecimal = (cents: CentsAmount, decimal: DecimalAmount): boolean => toDecimal(cents) >= decimal;

/**
 * Compare a cents amount against a decimal threshold.
 *
 * @example
 * centsLteDecimal(asCents(5000), asDecimal(100)) // => true (50 <= 100)
 */
export const centsLteDecimal = (cents: CentsAmount, decimal: DecimalAmount): boolean => toDecimal(cents) <= decimal;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Helper type to convert model fields from number to CentsAmount.
 * Useful for typing DB model interfaces.
 */
export type WithCentsFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: CentsAmount;
};

/**
 * Helper type to convert model fields from number to DecimalAmount.
 * Useful for typing API response interfaces.
 */
export type WithDecimalFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: DecimalAmount;
};
