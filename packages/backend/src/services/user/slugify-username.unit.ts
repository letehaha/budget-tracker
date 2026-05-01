import { describe, expect, it } from '@jest/globals';

import { slugifyUsername } from './slugify-username';

describe('slugifyUsername', () => {
  describe('basic ASCII inputs', () => {
    it('passes through valid slugs unchanged', () => {
      expect(slugifyUsername('john')).toBe('john');
      expect(slugifyUsername('john-doe')).toBe('john-doe');
      expect(slugifyUsername('user42')).toBe('user42');
    });

    it('lowercases mixed-case input', () => {
      expect(slugifyUsername('John')).toBe('john');
      expect(slugifyUsername('JOHN')).toBe('john');
      expect(slugifyUsername('JohnDoe')).toBe('johndoe');
    });

    it('replaces whitespace runs with a single hyphen', () => {
      expect(slugifyUsername('John Smith')).toBe('john-smith');
      expect(slugifyUsername('John  Smith')).toBe('john-smith');
      expect(slugifyUsername('John\tSmith')).toBe('john-smith');
      expect(slugifyUsername('John\nSmith')).toBe('john-smith');
    });

    it('replaces underscores with hyphens', () => {
      expect(slugifyUsername('john_doe')).toBe('john-doe');
      expect(slugifyUsername('john__doe')).toBe('john-doe');
      expect(slugifyUsername('mixed_under-dash')).toBe('mixed-under-dash');
    });

    it('strips disallowed punctuation', () => {
      expect(slugifyUsername('Foo. Bar.')).toBe('foo-bar');
      expect(slugifyUsername('john!@#$%^&*()')).toBe('john');
      expect(slugifyUsername('a/b\\c')).toBe('abc');
    });

    it('collapses runs of hyphens and trims edges', () => {
      expect(slugifyUsername('---john---')).toBe('john');
      expect(slugifyUsername('john - - smith')).toBe('john-smith');
      expect(slugifyUsername('-john-')).toBe('john');
    });

    it('trims leading and trailing whitespace', () => {
      expect(slugifyUsername('  john  ')).toBe('john');
      expect(slugifyUsername('Wendy Marlow ')).toBe('wendy-marlow');
    });
  });

  describe('unicode handling', () => {
    it('strips combining diacritics after NFKD normalization', () => {
      expect(slugifyUsername('café')).toBe('cafe');
      expect(slugifyUsername('naïve')).toBe('naive');
      expect(slugifyUsername('Łódź')).toBe('odz'); // Ł has no combining mark, gets dropped
    });

    it('falls back when input has no Latin characters', () => {
      // Cyrillic, Hangul, Han, etc. don't decompose into ASCII via NFKD —
      // they get filtered out and we fall back. Acceptable for now;
      // transliteration could be a future enhancement.
      expect(slugifyUsername('Серёжа')).toBe('user');
      expect(slugifyUsername('김민수')).toBe('user');
      expect(slugifyUsername('日本語')).toBe('user');
    });

    it('falls back for emoji-only input', () => {
      expect(slugifyUsername('🎉')).toBe('user');
      expect(slugifyUsername('🚀🎉')).toBe('user');
    });
  });

  describe('falsy and edge inputs', () => {
    it('falls back for null, undefined, empty, whitespace-only', () => {
      expect(slugifyUsername(null)).toBe('user');
      expect(slugifyUsername(undefined)).toBe('user');
      expect(slugifyUsername('')).toBe('user');
      expect(slugifyUsername('   ')).toBe('user');
      expect(slugifyUsername('\t\n')).toBe('user');
    });

    it('falls back for input that is all stripped chars', () => {
      expect(slugifyUsername('!!!')).toBe('user');
      expect(slugifyUsername('---')).toBe('user');
      expect(slugifyUsername('___')).toBe('user');
    });

    it('handles non-string inputs by falling back', () => {
      // @ts-expect-error — testing runtime behaviour
      expect(slugifyUsername(123)).toBe('user');
      // @ts-expect-error — testing runtime behaviour
      expect(slugifyUsername({})).toBe('user');
    });
  });

  describe('length cap', () => {
    it('truncates at MAX_LENGTH (64)', () => {
      const long = 'a'.repeat(300);
      const result = slugifyUsername(long);
      expect(result).toHaveLength(64);
      expect(result).toBe('a'.repeat(64));
    });

    it('does not leave a trailing hyphen after truncation', () => {
      // 60 'a' chars + space + 'bbbb' = 65 chars total. Truncating at 64
      // would leave the trailing hyphen from 'a-bbbb' → 'a-bbb'. The
      // implementation re-trims the hyphen.
      const input = `${'a'.repeat(60)} bbbb`;
      const result = slugifyUsername(input);
      expect(result).not.toMatch(/-$/);
      expect(result.length).toBeLessThanOrEqual(64);
    });
  });

  describe('production-data shapes (from prod audit)', () => {
    it('matches expected slugs for real prod usernames', () => {
      expect(slugifyUsername('Wendy Marlow')).toBe('wendy-marlow');
      expect(slugifyUsername('Felix Ironwood')).toBe('felix-ironwood');
      expect(slugifyUsername('Ivy Westlake')).toBe('ivy-westlake');
      expect(slugifyUsername('Quentin Blackwood')).toBe('quentin-blackwood');
      expect(slugifyUsername('PIPER K')).toBe('piper-k');
      expect(slugifyUsername('Foo. Bar.')).toBe('foo-bar');
      expect(slugifyUsername('Bartholomew Lichtenberg')).toBe('bartholomew-lichtenberg');
      // Trailing-whitespace variants observed in prod
      expect(slugifyUsername('Marigold ')).toBe('marigold');
      expect(slugifyUsername('Wendy Marlow ')).toBe('wendy-marlow');
    });

    it('leaves already-valid slugs unchanged', () => {
      expect(slugifyUsername('test1')).toBe('test1');
      expect(slugifyUsername('demo-abc12345')).toBe('demo-abc12345');
    });
  });
});
