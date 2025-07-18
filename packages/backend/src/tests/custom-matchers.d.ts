declare global {
  namespace jest {
    interface Matchers<R> {
      toBeAnythingOrNull(): R;
      toBeWithinRange(target: number, range: number): R;
      toBeNumericEqual(expected: number | string): R;
      toBeAfter(date: Date): R;
      toBeBefore(date: Date): R;
    }
    interface JestMatchers<T = unknown> {
      toBeAnythingOrNull(): T;
      toBeWithinRange(target: number, range: number): T;
      toBeNumericEqual(expected: number | string): T;
      toBeAfter(date: Date): T;
      toBeBefore(date: Date): T;
    }
  }
}

declare module '@jest/expect' {
  interface AsymmetricMatchers {
    toBeAnythingOrNull(): unknown | null;
    toBeWithinRange(target: number, range: number): number;
    toBeNumericEqual(expected: number | string): unknown;
  }
  interface Matchers<R> {
    toBeAnythingOrNull(): R;
    toBeWithinRange(target: number, range: number): R;
    toBeNumericEqual(expected: number | string): R;
    toBeAfter(date: Date): R;
    toBeBefore(date: Date): R;
  }
}

export {};
