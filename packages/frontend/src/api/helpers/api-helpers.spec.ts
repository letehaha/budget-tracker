import { fromSystemAmount, toSystemAmount } from './index';

describe('js/helpers/formatters', () => {
  describe('toSystemAmount', () => {
    test.each([
      [10, 1_000],
      [1, 100],
      [-1, -100],
      [-10_000, -1_000_000],
      [0.0125, 1],
      [NaN, NaN],
      [Infinity, Infinity],
    ])('%s to be %s', (value, expected) => {
      expect(toSystemAmount(value)).toBe(expected);
    });
  });

  describe('fromSystemAmount', () => {
    test.each([
      [1000, 10],
      [100, 1],
      [-100, -1],
      [-1_000_000, -10_000],
      [1.25, 0.0125],
      [NaN, NaN],
      [Infinity, Infinity],
    ])('%s to be %s', (value, expected) => {
      expect(fromSystemAmount(value)).toBe(expected);
    });
  });
});
