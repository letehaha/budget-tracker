import { describe, expect, it } from '@jest/globals';

import { parseDate } from './parse-date';

describe('parseDate', () => {
  it('parses ISO YYYY-MM-DD', () => {
    expect(parseDate('2024-01-15')).toBe('2024-01-15');
  });

  it('parses ISO-like with slash separators (YYYY/MM/DD)', () => {
    // Common in broker exports (Yahoo Finance, some EU brokers).
    expect(parseDate('2024/01/15')).toBe('2024-01-15');
    expect(parseDate('2026/05/22')).toBe('2026-05-22');
  });

  it('parses ISO-like with dot separators (YYYY.MM.DD)', () => {
    expect(parseDate('2024.01.15')).toBe('2024-01-15');
  });

  it('parses single-digit month/day under ISO-like patterns and zero-pads them', () => {
    // Some sources emit 2024/1/5 without zero-padding.
    expect(parseDate('2024/1/5')).toBe('2024-01-05');
  });

  it('parses compact 8-digit YYYYMMDD', () => {
    // Yahoo Finance trade-date column.
    expect(parseDate('20250131')).toBe('2025-01-31');
    expect(parseDate('20260428')).toBe('2026-04-28');
  });

  it('rejects invalid compact dates (month 13 / day 32)', () => {
    expect(parseDate('20241301')).toBeNull();
    expect(parseDate('20240232')).toBeNull();
  });

  it('still parses US format MM/DD/YYYY (existing)', () => {
    expect(parseDate('01/15/2024')).toBe('2024-01-15');
  });

  it('still parses European format DD.MM.YYYY (existing)', () => {
    expect(parseDate('15.01.2024')).toBe('2024-01-15');
  });

  it('returns null for empty / nonsense input', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('not-a-date')).toBeNull();
  });
});
