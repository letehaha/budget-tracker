import { calculatePercentageDifference } from './calculate-percentage-difference';

describe('calculatePercentageDifference', () => {
  // Formula: ((current - previous) / |previous|) * 100
  test.each([
    [0, 0, 0, 'returns 0 when both numbers are 0'],
    [0, 10, -100, 'returns -100 when current is 0'],
    [10, 0, 100, 'returns 100 when previous is 0 and current is positive'],
    [-10, 0, -100, 'returns -100 when previous is 0 and current is negative'],
    [20, -20, 200, 'calculates percentage for opposite signs (positive from negative)'],
    [-15, 15, -200, 'calculates percentage for opposite signs (negative from positive)'],
    [100, 90, 11.11, 'calculates correct percentage for positive numbers'],
    [90, 100, -10, 'calculates correct negative percentage for positive numbers'],
    [50, 40, 25, 'calculates correct percentage for positive numbers'],
    [40, 50, -20, 'calculates correct negative percentage for positive numbers'],
    [-100, -90, -11.11, 'calculates correct percentage for negative numbers'],
    [-90, -100, 10, 'calculates correct positive percentage for negative numbers'],
    [-50, -40, -25, 'calculates correct percentage for negative numbers'],
    [-40, -50, 20, 'calculates correct positive percentage for negative numbers'],
    [-10, 10, -200, 'calculates percentage for mixed signs'],
    [10, -10, 200, 'calculates percentage for mixed signs (reverse)'],
    [1, 1000000, -99.9999, 'calculates percentage for very large differences'],
    [-1000000, 1, -100000100, 'handles very large negative changes'],
    [0.1, 0.2, -50, 'handles floating point numbers'],
    [0.2, 0.1, 100, 'handles floating point numbers (reverse)'],
    [1.5, 2.5, -40, 'handles floating point numbers'],
    [2.5, 1.5, 66.67, 'handles floating point numbers (reverse)'],
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

  test('correctly calculates expense reduction', () => {
    // When expenses go from 4060 to 832, that's a 79.5% decrease
    expect(calculatePercentageDifference(832, 4060)).toBeCloseTo(-79.5, 1);
  });
});
