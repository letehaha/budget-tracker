declare global {
  namespace jest {
    interface Matchers<R> {
      toBeAnythingOrNull(): R;
      toBeWithinRange(target: number, range: number): R;
    }
    interface JestMatchers<T = unknown> {
      toBeAnythingOrNull(): T;
      toBeWithinRange(target: number, range: number): T;
    }
  }
}

declare module '@jest/expect' {
  interface AsymmetricMatchers {
    toBeAnythingOrNull(): unknown | null;
    toBeWithinRange(target: number, range: number): number;
  }
  interface Matchers<R> {
    toBeAnythingOrNull(): R;
    toBeWithinRange(target: number, range: number): R;
  }
}

export {};
