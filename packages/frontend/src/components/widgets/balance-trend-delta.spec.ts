import { formatBalanceDelta, formatBalanceDeltaPercent, shouldDisplayBalanceDelta } from './balance-trend-delta';

describe('components/widgets/balance-trend-delta', () => {
  describe('shouldDisplayBalanceDelta', () => {
    test.each([
      [0, false],
      [0.5, false],
      [-0.5, false],
      [0.99, false],
      [1, true],
      [-1, true],
      [1630, true],
      [-1630, true],
    ])('delta %s -> %s', (delta, expected) => {
      expect(shouldDisplayBalanceDelta({ delta })).toBe(expected);
    });
  });

  describe('formatBalanceDelta', () => {
    test.each([
      [1630, '+$1.63k'],
      [-1630, '-$1.63k'],
      [500, '+$500'],
      [-500, '-$500'],
      [0, '$0'],
      [1_460_000, '+$1.46M'],
    ])('delta %s -> %s', (delta, expected) => {
      expect(formatBalanceDelta({ delta })).toBe(expected);
    });

    test('threads a non-default currency through', () => {
      expect(formatBalanceDelta({ delta: 5, currency: 'USD' })).toBe('+$5');
    });
  });

  describe('formatBalanceDeltaPercent', () => {
    test.each([
      [0.6, '+0.6%'],
      [0, '0.0%'],
      [-1.2, '-1.2%'],
      [12.34, '+12.3%'],
    ])('percent %s -> %s', (percent, expected) => {
      expect(formatBalanceDeltaPercent({ percent })).toBe(expected);
    });
  });
});
