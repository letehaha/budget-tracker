declare global {
  namespace jest {
    interface Matchers<R> {
      toBeAnythingOrNull(): R;
      toBeWithinRange(target: number, range: number): R;
      toBeNumericEqual(expected: number | string): R;
      toBeAfter(date: Date): R;
      toBeBefore(date: Date): R;
      /**
       * Custom matcher for ref values (refAmount, refInitialBalance, refCurrentBalance, etc.)
       * Applies roundHalfToEven to the expected value and allows ±1 tolerance for floating point precision.
       * @param expected - The expected value (will be rounded using roundHalfToEven)
       */
      toEqualRefValue(expected: number): R;
    }
    interface JestMatchers<T = unknown> {
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
  }
}

declare module '@jest/expect' {
  interface AsymmetricMatchers {
    toBeAnythingOrNull(): unknown | null;
    toBeWithinRange(target: number, range: number): number;
    toBeNumericEqual(expected: number | string): unknown;
    toEqualRefValue(expected: number): number;
  }
  interface Matchers<R> {
    toBeAnythingOrNull(): R;
    toBeWithinRange(target: number, range: number): R;
    toBeNumericEqual(expected: number | string): R;
    toBeAfter(date: Date): R;
    toBeBefore(date: Date): R;
    toEqualRefValue(expected: number): R;
  }
}

// oxlint-disable-next-line unicorn/require-module-specifiers -- needed to make this a module for `declare global`
export {};
