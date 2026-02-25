import { amount, maxDecimalPoints, requiredToBeTrue } from './validators';

describe('js/helpers/validators', () => {
  describe('amount', () => {
    test.each([
      [1, true],
      [0.00001, true],
      [10_000_000, true],
      [-1, false],
      [NaN, false],
      [Infinity, false],
      ['', false],
      ['10', false],
      [[], false],
      [{}, false],
    ])('%s to be %s', (value, expected) => {
      expect(amount(value as number | string)).toBe(expected);
    });
  });

  describe('maxDecimalPoints', () => {
    test.each([
      [2, 1.12, true],
      [2, 1.123, false],
      [0, 1, true],
      [0, 1.0, true],
      [0, 1.1, false],
      [0, -1, true],
      [0, -1.1, false],
      [0, '', false],
      [1, 'as', false],
      [1, NaN, false],
      [1, Infinity, false],
      [1, -Infinity, false],
    ])('%s to be %s', (maxPoints, value, expected) => {
      expect(maxDecimalPoints(maxPoints)(value)).toBe(expected);
    });
  });

  describe('requiredToBeTrue', () => {
    test.each([
      [true, true],
      [false, false],
      [1, false],
      ['as', false],
      ['', false],
      [[], false],
      [{}, false],
      [() => ({}), false],
      [() => true, false],
    ])('%s to be %s', (value, expected) => {
      expect(requiredToBeTrue(value)).toBe(expected);
    });
  });
});
