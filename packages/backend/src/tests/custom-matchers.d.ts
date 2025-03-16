declare namespace jest {
  interface Matchers<R> {
    toBeAnythingOrNull(): R;
  }

  interface Expect<R> {
    toBeAnythingOrNull(): R;
  }
}
