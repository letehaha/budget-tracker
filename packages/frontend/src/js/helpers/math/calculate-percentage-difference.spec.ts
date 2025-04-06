import { calculatePercentageDifference } from './calculate-percentage-difference';

describe('calculatePercentageDifference', () => {
  test.each([
    [0, 0, 0, 'returns 0 when both numbers are 0'],
    [0, 10, -100, 'returns -100 when first number is 0'],
    [10, 0, 100, 'returns 100 when second number is 0'],
    [20, -20, 100, 'returns 100 when numbers have opposite signs (positive to negative)'],
    [-15, 15, -100, 'returns -100 when numbers have opposite signs (negative to positive)'],
    [100, 90, 10.53, 'calculates correct percentage for positive numbers'],
    [90, 100, -10.53, 'calculates correct negative percentage for positive numbers'],
    [50, 40, 22.22, 'calculates correct percentage for positive numbers'],
    [40, 50, -22.22, 'calculates correct negative percentage for positive numbers'],
    [-100, -90, -10.53, 'calculates correct percentage for negative numbers'],
    [-90, -100, 10.53, 'calculates correct positive percentage for negative numbers'],
    [-50, -40, -22.22, 'calculates correct percentage for negative numbers'],
    [-40, -50, 22.22, 'calculates correct positive percentage for negative numbers'],
    [-10, 10, -100, 'calculates correct percentage for mixed positive and negative numbers'],
    [10, -10, 100, 'calculates correct percentage for mixed positive and negative numbers'],
    [1, 1000000, -99.9998, 'calculates percentage for very large differences'],
    [-1000000, 1, -100, 'returns -100 for very large negative differences'],
    [0.1, 0.2, -66.67, 'handles floating point numbers'],
    [0.2, 0.1, 66.67, 'handles floating point numbers (reverse)'],
    [1.5, 2.5, -50, 'handles floating point numbers'],
    [2.5, 1.5, 50, 'handles floating point numbers (reverse)'],
    [NaN, 10, -100, 'treats NaN as 0'],
    [10, NaN, 100, 'treats NaN as 0'],
    [NaN, NaN, 0, 'treats NaN as 0 (both NaN)'],
    [Infinity, 10, -100, 'treats Infinity as 0'],
    [10, Infinity, 100, 'treats Infinity as 0'],
    [Infinity, Infinity, 0, 'treats Infinity as 0 (both Infinity)'],
    [-Infinity, 10, -100, 'treats -Infinity as 0'],
    [10, -Infinity, 100, 'treats -Infinity as 0'],
    [-Infinity, -Infinity, 0, 'treats -Infinity as 0 (both -Infinity)'],
  ])('(%f, %f) = %f (%s)', (a, b, expected) => {
    expect(calculatePercentageDifference(a, b)).toBeCloseTo(expected, 2);
  });

  test('is not symmetric', () => {
    const a = 10;
    const b = 20;
    expect(calculatePercentageDifference(a, b)).toBeCloseTo(-calculatePercentageDifference(b, a), 5);
  });
});
