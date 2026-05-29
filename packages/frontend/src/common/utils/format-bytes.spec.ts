import { describe, expect, it } from 'vitest';

import { formatBytes } from './format-bytes';

describe('formatBytes', () => {
  it('formats sub-KB values as integer bytes', () => {
    expect(formatBytes({ bytes: 0 })).toBe('0 B');
    expect(formatBytes({ bytes: 1 })).toBe('1 B');
    expect(formatBytes({ bytes: 1023 })).toBe('1023 B');
  });

  it('formats KB range with one decimal by default', () => {
    expect(formatBytes({ bytes: 1024 })).toBe('1.0 KB');
    expect(formatBytes({ bytes: 1536 })).toBe('1.5 KB');
    expect(formatBytes({ bytes: 1024 * 1023 })).toBe('1023.0 KB');
  });

  it('formats MB range', () => {
    expect(formatBytes({ bytes: 1024 * 1024 })).toBe('1.0 MB');
    expect(formatBytes({ bytes: 5.5 * 1024 * 1024 })).toBe('5.5 MB');
  });

  it('formats GB range', () => {
    expect(formatBytes({ bytes: 1024 * 1024 * 1024 })).toBe('1.0 GB');
    expect(formatBytes({ bytes: 2.75 * 1024 * 1024 * 1024 })).toBe('2.8 GB');
  });

  it('respects the fractionDigits override', () => {
    expect(formatBytes({ bytes: 1536, fractionDigits: 0 })).toBe('2 KB');
    expect(formatBytes({ bytes: 1234567, fractionDigits: 3 })).toBe('1.177 MB');
  });

  it('treats negative inputs as zero', () => {
    expect(formatBytes({ bytes: -10 })).toBe('0 B');
  });
});
