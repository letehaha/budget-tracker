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

/**
 * Recursively checks that type T does NOT contain any instances of ForbiddenType.
 * If a forbidden type is found, it converts that field to `never`, causing a
 * compile-time error.
 *
 * This is used to ensure controller responses never leak CentsAmount values.
 *
 * @example
 * type BadResponse = { amount: CentsAmount };
 * type GoodResponse = { amount: DecimalAmount };
 *
 * type CheckBad = AssertNoDeep<BadResponse, CentsAmount>;
 * // ❌ amount: never — TypeScript error: CentsAmount is not assignable to never
 *
 * type CheckGood = AssertNoDeep<GoodResponse, CentsAmount>;
 * // ✅ amount: DecimalAmount — compiles
 */
export type AssertNoDeep<T, ForbiddenType> = T extends ForbiddenType
  ? never
  : T extends Array<infer U>
    ? Array<AssertNoDeep<U, ForbiddenType>>
    : T extends object
      ? {
          [K in keyof T]: AssertNoDeep<T[K], ForbiddenType>;
        }
      : T;
