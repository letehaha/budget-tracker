import { removeUndefinedKeys, truncateSystemAmount } from '@js/helpers';

describe('helpers tests', () => {
  describe('removeUndefinedKeys', () => {
    test.each([
      [{ id: 1, test: undefined }, { id: 1 }],
      [
        { id: 1, test: 'test' },
        { id: 1, test: 'test' },
      ],
      [{ id: 1, test: NaN }, { id: 1 }],
      [{ id: 1, test: new Date('undefined') }, { id: 1 }],
    ])('%s to be %s', (value, expected) => {
      expect(removeUndefinedKeys(value)).toStrictEqual(expected);
    });
  });
  describe('truncateSystemAmount', () => {
    test.each([
      [5.05, 5],
      [5.95, 5],
      [-5.05, -5],
      [-5.95, -5],
    ])('%s to be %s', (value, expected) => {
      expect(truncateSystemAmount(value)).toStrictEqual(expected);
    });
  });
});
