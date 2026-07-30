import { describe, expect, it } from 'vitest';

import { getMonogramTextColor } from './monogram-color';

const DARK_TEXT = '#201c16';
const LIGHT_TEXT = '#ffffff';

describe('getMonogramTextColor', () => {
  it('returns white letters on dark fills', () => {
    expect(getMonogramTextColor({ hex: '#000000' })).toBe(LIGHT_TEXT);
    // Default violet swatch.
    expect(getMonogramTextColor({ hex: '#7355be' })).toBe(LIGHT_TEXT);
    expect(getMonogramTextColor({ hex: '#6b7280' })).toBe(LIGHT_TEXT);
  });

  it('returns dark letters on light fills', () => {
    expect(getMonogramTextColor({ hex: '#ffffff' })).toBe(DARK_TEXT);
    expect(getMonogramTextColor({ hex: '#f59e0b' })).toBe(DARK_TEXT);
  });

  it('flips at the brightness threshold', () => {
    // Neutral grays land exactly on the weighted luminance of their channel value:
    // 140/255 sits just under 0.55, 141/255 just over.
    expect(getMonogramTextColor({ hex: '#8c8c8c' })).toBe(LIGHT_TEXT);
    expect(getMonogramTextColor({ hex: '#8d8d8d' })).toBe(DARK_TEXT);
  });

  it('accepts uppercase hex and surrounding whitespace', () => {
    expect(getMonogramTextColor({ hex: '#F59E0B' })).toBe(DARK_TEXT);
    expect(getMonogramTextColor({ hex: '  #7355BE  ' })).toBe(LIGHT_TEXT);
  });

  it('falls back to white letters for malformed input', () => {
    expect(getMonogramTextColor({ hex: 'not-a-color' })).toBe(LIGHT_TEXT);
    expect(getMonogramTextColor({ hex: '#fff' })).toBe(LIGHT_TEXT);
  });
});
