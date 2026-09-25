import { describe, expect, it } from 'vitest';
import type { ComposerTranslation } from 'vue-i18n';

import { formatDuration } from './format-duration';

const t = ((key: string, named: Record<string, unknown>, plural?: number) =>
  `${key}:${JSON.stringify(named)}${plural === undefined ? '' : `#${plural}`}`) as unknown as ComposerTranslation;

describe('formatDuration', () => {
  it('months only', () => {
    expect(formatDuration({ months: 7, t })).toBe('common.duration.months:{"n":7}#7');
    expect(formatDuration({ months: 0, t })).toBe('common.duration.months:{"n":0}#0');
  });

  it('whole years', () => {
    expect(formatDuration({ months: 24, t })).toBe('common.duration.years:{"n":2}#2');
  });

  it('years and months', () => {
    expect(formatDuration({ months: 127, t })).toBe(
      'common.duration.years:{"n":10}#10 common.duration.months:{"n":7}#7',
    );
  });

  it('accepts custom keys', () => {
    const keys = {
      years: 'a.years',
      months: 'a.months',
      yearsMonths: 'a.yearsMonths',
    };
    expect(formatDuration({ months: 13, t, keys })).toBe('a.yearsMonths:{"y":1,"m":1}');
    expect(formatDuration({ months: 12, t, keys })).toBe('a.years:{"n":1}#1');
  });
});
