import { removeValuesFromObject } from './remove-values-from-object';

describe('removeValuesFromObject', () => {
  it('removes null and undefined values by default', () => {
    const input = {
      a: 1,
      b: 'hello',
      c: null,
      d: undefined,
      e: false,
      f: 0,
    };

    const result = removeValuesFromObject(input);

    expect(result).toEqual({
      a: 1,
      b: 'hello',
      e: false,
      f: 0,
    });
  });

  it('removes specified values', () => {
    const input = {
      a: 1,
      b: 'hello',
      c: null,
      d: undefined,
      e: false,
      f: 0,
      g: '',
    };

    const result = removeValuesFromObject(input, [null, undefined, false, 0, '']);

    expect(result).toEqual({
      a: 1,
      b: 'hello',
    });
  });

  it('returns an empty object when all values are removed', () => {
    const input = {
      a: null,
      b: undefined,
      c: false,
    };

    const result = removeValuesFromObject(input, [null, undefined, false]);

    expect(result).toEqual({});
  });

  it('returns the same object when no values to remove are present', () => {
    const input = {
      a: 1,
      b: 'hello',
      c: true,
      d: {},
    };

    const result = removeValuesFromObject(input, [null, undefined, false]);

    expect(result).toEqual(input);
  });
});
