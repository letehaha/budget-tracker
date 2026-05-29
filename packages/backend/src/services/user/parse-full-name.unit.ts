import { describe, expect, it } from 'vitest';

import { parseFullName } from './parse-full-name';

describe('parseFullName', () => {
  describe('empty / falsy inputs', () => {
    it('returns {} for null, undefined, empty string, whitespace-only', () => {
      expect(parseFullName(null)).toEqual({});
      expect(parseFullName(undefined)).toEqual({});
      expect(parseFullName('')).toEqual({});
      expect(parseFullName('   ')).toEqual({});
      expect(parseFullName('\t\n')).toEqual({});
    });

    it('returns {} for non-string inputs', () => {
      // @ts-expect-error — testing runtime behaviour
      expect(parseFullName(123)).toEqual({});
      // @ts-expect-error — testing runtime behaviour
      expect(parseFullName({})).toEqual({});
    });
  });

  describe('single-token names', () => {
    it('puts single token in firstName', () => {
      expect(parseFullName('Marigold')).toEqual({ firstName: 'Marigold' });
      expect(parseFullName('John')).toEqual({ firstName: 'John' });
    });

    it('preserves original casing', () => {
      expect(parseFullName('JOHN')).toEqual({ firstName: 'JOHN' });
      expect(parseFullName('john')).toEqual({ firstName: 'john' });
    });

    it('trims edge whitespace before single-token check', () => {
      expect(parseFullName('  Marigold  ')).toEqual({ firstName: 'Marigold' });
    });
  });

  describe('two-token names', () => {
    it('splits into firstName + lastName', () => {
      expect(parseFullName('Wendy Marlow')).toEqual({ firstName: 'Wendy', lastName: 'Marlow' });
      expect(parseFullName('Quentin Blackwood')).toEqual({ firstName: 'Quentin', lastName: 'Blackwood' });
      expect(parseFullName('PIPER K')).toEqual({ firstName: 'PIPER', lastName: 'K' });
    });

    it('does not produce a middleName', () => {
      const result = parseFullName('Theo Dunn');
      expect(result.middleName).toBeUndefined();
    });

    it('handles trailing whitespace', () => {
      expect(parseFullName('Wendy Marlow ')).toEqual({ firstName: 'Wendy', lastName: 'Marlow' });
    });

    it('collapses multiple whitespace between tokens', () => {
      expect(parseFullName('Wendy   Marlow')).toEqual({ firstName: 'Wendy', lastName: 'Marlow' });
      expect(parseFullName('Wendy\tMarlow')).toEqual({ firstName: 'Wendy', lastName: 'Marlow' });
    });
  });

  describe('three or more tokens', () => {
    it('splits into firstName + middleName + lastName for three tokens', () => {
      expect(parseFullName('Caspian Reed Holloway')).toEqual({
        firstName: 'Caspian',
        middleName: 'Reed',
        lastName: 'Holloway',
      });
      expect(parseFullName('Atticus Brookmoore Kane')).toEqual({
        firstName: 'Atticus',
        middleName: 'Brookmoore',
        lastName: 'Kane',
      });
    });

    it('joins middle tokens for four+ tokens', () => {
      expect(parseFullName('John Quincy Adams Smith')).toEqual({
        firstName: 'John',
        middleName: 'Quincy Adams',
        lastName: 'Smith',
      });
    });

    it('keeps punctuation in name tokens unchanged', () => {
      expect(parseFullName('Foo. Bar.')).toEqual({ firstName: 'Foo.', lastName: 'Bar.' });
    });
  });

  describe('punctuation and special characters', () => {
    it('preserves hyphens within name tokens', () => {
      expect(parseFullName('Mary-Jane Smith')).toEqual({
        firstName: 'Mary-Jane',
        lastName: 'Smith',
      });
      expect(parseFullName('Maria Lopez-Garcia')).toEqual({
        firstName: 'Maria',
        lastName: 'Lopez-Garcia',
      });
    });

    it('preserves diacritics (no NFKD here — slugify handles those)', () => {
      expect(parseFullName('café noir')).toEqual({ firstName: 'café', lastName: 'noir' });
    });
  });
});
