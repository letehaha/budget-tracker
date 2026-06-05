import { describe, expect, it } from '@jest/globals';

import { normalizePayeeName } from './normalize-name';

describe('normalizePayeeName', () => {
  it('lowercases ASCII letters', () => {
    expect(normalizePayeeName({ raw: 'AMAZON' })).toBe('amazon');
  });

  it('replaces punctuation with single spaces and collapses runs', () => {
    expect(normalizePayeeName({ raw: "McDonald's #4521" })).toBe('mcdonald s 4521');
  });

  it('handles mixed punctuation in provider strings', () => {
    expect(normalizePayeeName({ raw: 'AMAZON.COM*A4B2' })).toBe('amazon com a4b2');
  });

  it('collapses internal multi-space runs', () => {
    expect(normalizePayeeName({ raw: 'Uber  Eats' })).toBe('uber eats');
  });

  it('strips combining diacritics after NFKD decomposition', () => {
    expect(normalizePayeeName({ raw: 'Café Münchner' })).toBe('cafe munchner');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizePayeeName({ raw: '   ' })).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(normalizePayeeName({ raw: '' })).toBe('');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizePayeeName({ raw: '   AMAZON  ' })).toBe('amazon');
  });

  it('treats different precomposed/decomposed forms identically', () => {
    const precomposed = 'café';
    const decomposed = 'café';
    expect(normalizePayeeName({ raw: precomposed })).toBe(normalizePayeeName({ raw: decomposed }));
  });

  it('preserves Cyrillic letters (no false-strip via \\p{L} class)', () => {
    expect(normalizePayeeName({ raw: 'АТБ #4123' })).toBe('атб 4123');
  });

  it('keeps spaces but removes tabs and newlines', () => {
    expect(normalizePayeeName({ raw: 'Uber\tEats\nDelivery' })).toBe('uber eats delivery');
  });

  it('handles unicode dash/hyphen variants as punctuation', () => {
    expect(normalizePayeeName({ raw: 'TARGET — STORE' })).toBe('target store');
  });

  it('drops emojis (not in L or N categories)', () => {
    expect(normalizePayeeName({ raw: 'Starbucks ☕ #1' })).toBe('starbucks 1');
  });
});
