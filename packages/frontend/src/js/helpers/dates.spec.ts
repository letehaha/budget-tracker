import { getHoursInMilliseconds } from './dates';

describe('js/helpers/dates', () => {
  describe('getHoursInMilliseconds', () => {
    test.each([
      [10, 36_000_000],
      [1.5, 5_400_000],
      [0.1, 360_000],
      [0, 0],
      [-10, -36_000_000],
      [Infinity, Infinity],
      [-Infinity, -Infinity],
      [NaN, NaN],
    ])('%s hours is %s millliseconds', (value, expected) => {
      expect(getHoursInMilliseconds(value)).toBe(expected);
    });
  });
});
