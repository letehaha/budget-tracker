import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getDefaultValue } from './get-default-value-from-zod-schema';

describe('getDefaultValue', () => {
  it('returns default values for primitive types', () => {
    expect(getDefaultValue(z.string())).toBe(''); // Default for string
    expect(getDefaultValue(z.number())).toBe(0); // Default for number
    expect(getDefaultValue(z.boolean())).toBe(false); // Default for boolean
    expect(getDefaultValue(z.date())).toBeInstanceOf(Date); // Default for date
  });

  it('returns undefined for unhandled types', () => {
    expect(getDefaultValue(z.undefined())).toBe(undefined);
  });

  it('returns null for nullable types', () => {
    expect(getDefaultValue(z.string().nullable())).toBe(null);
    expect(getDefaultValue(z.number().nullable())).toBe(null);
  });

  it('returns undefined for optional types', () => {
    expect(getDefaultValue(z.string().optional())).toBe(undefined);
    expect(getDefaultValue(z.number().optional())).toBe(undefined);
  });

  it('returns an empty array for array types', () => {
    expect(getDefaultValue(z.array(z.string()))).toEqual([]);
    expect(getDefaultValue(z.array(z.number()))).toEqual([]);
  });

  it('returns a default object for ZodObject', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
    });

    expect(getDefaultValue(schema)).toEqual({
      name: '',
      age: 0,
      active: false,
    });
  });

  it('handles nested objects', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        age: z.number(),
      }),
      active: z.boolean(),
    });

    expect(getDefaultValue(schema)).toEqual({
      user: {
        name: '',
        age: 0,
      },
      active: false,
    });
  });

  it('handles objects with optional fields', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    });

    expect(getDefaultValue(schema)).toEqual({
      name: '',
      age: undefined,
    });
  });

  it('handles objects with nullable fields', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().nullable(),
    });

    expect(getDefaultValue(schema)).toEqual({
      name: '',
      age: null,
    });
  });

  it('handles arrays of objects', () => {
    const schema = z.array(
      z.object({
        id: z.number(),
        name: z.string(),
      }),
    );

    expect(getDefaultValue(schema)).toEqual([]);
  });

  it('handles deeply nested schemas', () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          username: z.string(),
          bio: z.string().nullable(),
        }),
        friends: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
          }),
        ),
      }),
    });

    expect(getDefaultValue(schema)).toEqual({
      user: {
        profile: {
          username: '',
          bio: null,
        },
        friends: [],
      },
    });
  });

  it('handles mixed optional and nullable fields', () => {
    const schema = z.object({
      name: z.string().optional(),
      age: z.number().nullable(),
    });

    expect(getDefaultValue(schema)).toEqual({
      name: undefined,
      age: null,
    });
  });
});
