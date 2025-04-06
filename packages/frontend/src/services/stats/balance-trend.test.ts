import { aggregateBalanceTrendData } from './balance-trend';

describe('aggregateBalanceTrendData', () => {
  test.each([
    ['should handle an empty array', [], []],
    [
      'should aggregate data for a single account with a gap in data',
      [
        { date: '2021-01-01', amount: 100, accountId: 1 },
        { date: '2021-01-05', amount: 150, accountId: 1 },
      ],
      [
        { date: '2021-01-01', amount: 100 },
        { date: '2021-01-02', amount: 100 },
        { date: '2021-01-03', amount: 100 },
        { date: '2021-01-04', amount: 100 },
        { date: '2021-01-05', amount: 150 },
      ],
    ],
    [
      'handle simple dataset',
      [
        { date: '2021-01-01', amount: 100, accountId: 1 },
        { date: '2021-01-02', amount: 150, accountId: 1 },
        { date: '2021-01-03', amount: 5000, accountId: 2 },
      ],
      [
        // 1 100 + 200 = 300
        // 2 150 + 200 = 350
        // 3 150 + -50 = 100
        { date: '2021-01-01', amount: 5100 },
        { date: '2021-01-02', amount: 5150 },
        { date: '2021-01-03', amount: 5150 },
      ],
    ],
    [
      'should handle single date correctly',
      [
        { date: '2023-09-01', amount: 1970421, accountId: 95 },
        { date: '2023-09-01T00:00:00.000Z', amount: 0, accountId: 93 },
        { date: '2023-09-01T00:00:00.000Z', amount: 0, accountId: 99 },
        { date: '2023-09-01T00:00:00.000Z', amount: 4418383, accountId: 113 },
        { date: '2023-09-01T00:00:00.000Z', amount: 88367664, accountId: 109 },
        { date: '2023-09-01T00:00:00.000Z', amount: 0, accountId: 94 },
        { date: '2023-09-01T00:00:00.000Z', amount: 0, accountId: 96 },
        { date: '2023-09-01T00:00:00.000Z', amount: 0, accountId: 112 },
        { date: '2023-09-01T00:00:00.000Z', amount: 0, accountId: 98 },
        { date: '2023-09-01T00:00:00.000Z', amount: 144945061, accountId: 110 },
        { date: '2023-09-01T00:00:00.000Z', amount: 0, accountId: 100 },
      ],
      [
        {
          date: '2023-09-01',
          amount: 1970421 + 4418383 + 88367664 + 144945061,
        },
      ],
    ],
  ])('%s', (_, input, output) => {
    expect(aggregateBalanceTrendData(input)).toStrictEqual(output);
  });
});
