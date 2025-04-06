import { formatFiat, formatUIAmount } from './formatters';

describe('js/helpers/formatters', () => {
  describe('formatUIAmount', () => {
    test.each([
      [10_000, '$10,000.00'],
      [1, '$1.00'],
      [-1, '-$1.00'],
      [-10_000, '-$10,000.00'],
      [0.0125, '$0.01'],
      [NaN, 'NaN'],
      [Infinity, 'Infinity'],
    ])('%s to be %s', (value, expected) => {
      expect(formatUIAmount(value)).toBe(expected);
    });
  });

  describe('formatFiat', () => {
    test.each([
      [10_000, '10000.00'],
      [1, '1.00'],
      [-1, '-1.00'],
      [-10_000, '-10000.00'],
      [0.0125, '0.01'],
      [NaN, 'NaN'],
      [Infinity, 'Infinity'],
    ])('%s to be %s', (value, expected) => {
      expect(formatFiat(value)).toBe(expected);
    });
  });
});
