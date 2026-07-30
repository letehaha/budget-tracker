import { describe, expect, it } from 'vitest';

import { clampInitials, deriveInitials } from './monogram-initials';

// Family emoji: 4 code points + 3 ZWJs = 7 code points, one grapheme.
const FAMILY = '👨‍👩‍👧‍👦';
// Skin-toned family: 4 (base + modifier) pairs + 3 ZWJs = 11 code points, one grapheme.
const TONED_FAMILY = '👨🏻‍👩🏻‍👧🏻‍👦🏻';

const countGraphemes = (value: string): number =>
  [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length;

describe('deriveInitials', () => {
  it('derives one initial per word, uppercased', () => {
    expect(deriveInitials({ name: 'Local Bakery' })).toBe('LB');
    expect(deriveInitials({ name: 'Netflix' })).toBe('N');
  });

  it('clamps uppercase expansions (ß → SS) back to two graphemes', () => {
    expect(deriveInitials({ name: 'ßeta ßank' })).toBe('SS');
  });

  it('clamps ligature expansions (ﬁ → FI) back to two graphemes', () => {
    expect(deriveInitials({ name: 'ﬁrst ﬁnal' })).toBe('FI');
  });

  it('keeps a leading ZWJ emoji as one whole grapheme', () => {
    expect(deriveInitials({ name: `${FAMILY} Restaurant` })).toBe(`${FAMILY}R`);
  });

  it('keeps two family emoji (14 code points, under the 16 cap)', () => {
    expect(deriveInitials({ name: `${FAMILY}foo ${FAMILY}bar` })).toBe(`${FAMILY}${FAMILY}`);
  });

  it('drops the second grapheme when two initials exceed 16 code points', () => {
    // Two toned families = 22 code points; only the first survives.
    expect(deriveInitials({ name: `${TONED_FAMILY}a ${TONED_FAMILY}b` })).toBe(TONED_FAMILY);
  });

  it('returns empty string for blank input', () => {
    expect(deriveInitials({ name: '   ' })).toBe('');
  });

  it('never exceeds 2 graphemes or 16 code points', () => {
    const samples = ['ßeta ßank', 'ﬁrst ﬁnal', `${TONED_FAMILY}x ${TONED_FAMILY}y`, 'Some Very Long Name', FAMILY];
    for (const name of samples) {
      const result = deriveInitials({ name });
      expect(countGraphemes(result)).toBeLessThanOrEqual(2);
      expect([...result].length).toBeLessThanOrEqual(16);
    }
  });
});

describe('clampInitials', () => {
  it('keeps short values untouched', () => {
    expect(clampInitials({ value: 'AB' })).toBe('AB');
    expect(clampInitials({ value: '' })).toBe('');
  });

  it('cuts to two graphemes without splitting emoji', () => {
    expect(clampInitials({ value: 'ABCD' })).toBe('AB');
    expect(clampInitials({ value: `${FAMILY}AB` })).toBe(`${FAMILY}A`);
  });

  it('drops the second grapheme when the pair exceeds 16 code points', () => {
    expect(clampInitials({ value: `${TONED_FAMILY}${TONED_FAMILY}` })).toBe(TONED_FAMILY);
  });

  it('keeps a two-emoji pair that fits the code-point cap', () => {
    expect(clampInitials({ value: `${FAMILY}${FAMILY}` })).toBe(`${FAMILY}${FAMILY}`);
  });
});
