import { describe, expect, it } from '@jest/globals';

import { buildNote } from './apply-actions';

describe('buildNote', () => {
  it('drops the current note in replace mode', () => {
    expect(buildNote({ current: 'original', mode: 'replace', value: 'fresh' })).toBe('fresh');
  });

  it('wraps the current note in append and prepend mode', () => {
    expect(buildNote({ current: 'original', mode: 'append', value: 'extra' })).toBe('original extra');
    expect(buildNote({ current: 'original', mode: 'prepend', value: 'extra' })).toBe('extra original');
    expect(buildNote({ current: '', mode: 'append', value: 'extra' })).toBe('extra');
  });

  it('truncates at 2000 characters', () => {
    const appended = buildNote({ current: 'y'.repeat(1900), mode: 'append', value: 'x'.repeat(200) });
    expect(appended).toHaveLength(2000);
    expect(appended.endsWith('x')).toBe(true);

    expect(buildNote({ current: 'original', mode: 'replace', value: 'z'.repeat(2500) })).toHaveLength(2000);
  });
});
