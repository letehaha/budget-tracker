declare const __cents: unique symbol;
declare const __decimal: unique symbol;

/** Branded type representing a value in cents (integer, e.g. 1550 = $15.50). */
export type Cents = number & { readonly [__cents]: true };

/** Branded type representing a decimal monetary value (e.g. 15.50). */
export type Decimal = number & { readonly [__decimal]: true };

/** Cast a plain number to Cents at a trust boundary (e.g. Monobank API values known to be cents). */
export function asCents(n: number): Cents {
  return n as Cents;
}

/** Cast a plain number to Decimal at a trust boundary. */
export function asDecimal(n: number): Decimal {
  return n as Decimal;
}
