import { describe, expect, test } from 'vitest';

import { areSlicesEqual } from './refund-form-comparer';

describe('areSlicesEqual', () => {
  test.each([
    [{ a: { foo: 1, bar: 2 } }, { a: { foo: 1, bar: 3 } }, ['foo'], true, 'nested objects with specified key'],
    [
      { a: { foo: 1, bar: 2 } },
      { a: { foo: 2, bar: 2 } },
      ['foo'],
      false,
      'nested objects with different specified key',
    ],
    [
      { a: { id: 1, name: 'John' }, b: { id: 2, name: 'Jane' } },
      { a: { id: 1, name: 'Johnny' }, b: { id: 2, name: 'Janet' } },
      ['id'],
      true,
      'multiple nested objects with specified key',
    ],
    [
      { a: { id: 1, name: 'John' }, b: { id: 2, name: 'Jane' } },
      { a: { id: 1, name: 'John' }, b: { id: 3, name: 'Jane' } },
      ['id'],
      false,
      'multiple nested objects with different specified key',
    ],
    [
      { a: { foo: 1, bar: 2 } },
      { a: { foo: 1, bar: 2 } },
      undefined,
      true,
      'nested objects without specified keys (full comparison)',
    ],
    [
      { a: { foo: 1, bar: 2 } },
      { a: { foo: 1, bar: 3 } },
      undefined,
      false,
      'nested objects without specified keys (full comparison, different values)',
    ],
    [{ a: 1, b: 2 }, { a: 1, b: 2 }, undefined, true, 'primitive values'],
    [{ a: undefined, b: undefined }, { a: undefined, b: undefined }, undefined, true, 'undefined values'],
    [{ a: null, b: null }, { a: null, b: null }, undefined, true, 'nullish values'],
    [{ a: null, b: 2 }, { a: null, b: 2 }, undefined, true, 'objects with null values'],
    [
      { a: new Date(2023, 5, 1), b: 2 },
      { a: new Date(2023, 5, 1), b: 2 },
      undefined,
      true,
      'objects with Date objects',
    ],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ])('compares %o and %o (keys: %o) => %s (%s)', (obj1, obj2, keys, expected, description) => {
    expect(areSlicesEqual(obj1, obj2, keys)).toBe(expected);
  });
});
