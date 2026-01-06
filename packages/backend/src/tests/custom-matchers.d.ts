import 'vitest';

declare module 'vitest' {
  interface Assertion<T = any> {
    toBeAnythingOrNull(): T;
    toBeWithinRange(target: number, range: number): T;
    toBeNumericEqual(expected: number | string): T;
    toBeAfter(date: Date): T;
    toBeBefore(date: Date): T;
    /**
     * Custom matcher for ref values (refAmount, refInitialBalance, refCurrentBalance, etc.)
     * Applies roundHalfToEven to the expected value and allows ±1 tolerance for floating point precision.
     * @param expected - The expected value (will be rounded using roundHalfToEven)
     */
    toEqualRefValue(expected: number): T;
  }
  interface AsymmetricMatchersContaining {
    toBeAnythingOrNull(): unknown | null;
    toBeWithinRange(target: number, range: number): number;
    toBeNumericEqual(expected: number | string): unknown;
    toEqualRefValue(expected: number): number;
  }
}

export {};
