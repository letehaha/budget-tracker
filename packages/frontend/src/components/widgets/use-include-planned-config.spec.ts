import { describe, expect, it } from 'vitest';

import { readIncludePlanned } from './use-include-planned-config';

describe('readIncludePlanned', () => {
  it('defaults to true without a config', () => {
    expect(readIncludePlanned({ config: undefined })).toBe(true);
  });

  it('defaults to true when the key is absent', () => {
    expect(readIncludePlanned({ config: { someOtherSetting: 1 } })).toBe(true);
  });

  it('returns false when the key is false', () => {
    expect(readIncludePlanned({ config: { includePlanned: false } })).toBe(false);
  });

  it('returns true when the key is true', () => {
    expect(readIncludePlanned({ config: { includePlanned: true } })).toBe(true);
  });
});
