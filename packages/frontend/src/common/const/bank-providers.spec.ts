import { type ProviderRegion, REGION_FILTER_GROUPS, providerMatchesRegionFilter } from '@/common/const/bank-providers';
import { describe, expect, it } from 'vitest';

const region = (code: ProviderRegion['code']): ProviderRegion => ({ code, labelKey: `region.${code}` });

const codesOf = (key: string) => REGION_FILTER_GROUPS.find((group) => group.key === key)!.codes;

describe('providerMatchesRegionFilter', () => {
  const lunchflowRegions = ['us', 'eu', 'gb', 'ca', 'au', 'nz'].map((code) => region(code as ProviderRegion['code']));
  const walutomatRegions = [region('pl')];

  it('matches a multi-region provider against us/ca, eu/uk and poland', () => {
    expect(providerMatchesRegionFilter({ regions: lunchflowRegions, codes: codesOf('usCanada') })).toBe(true);
    expect(providerMatchesRegionFilter({ regions: lunchflowRegions, codes: codesOf('euUk') })).toBe(true);
    expect(providerMatchesRegionFilter({ regions: lunchflowRegions, codes: codesOf('poland') })).toBe(true);
  });

  it('does not match a provider without ukrainian coverage', () => {
    expect(providerMatchesRegionFilter({ regions: lunchflowRegions, codes: codesOf('ukraine') })).toBe(false);
  });

  it('matches a poland-only provider against poland alone', () => {
    expect(providerMatchesRegionFilter({ regions: walutomatRegions, codes: codesOf('poland') })).toBe(true);
    expect(providerMatchesRegionFilter({ regions: walutomatRegions, codes: codesOf('euUk') })).toBe(false);
    expect(providerMatchesRegionFilter({ regions: walutomatRegions, codes: codesOf('usCanada') })).toBe(false);
    expect(providerMatchesRegionFilter({ regions: walutomatRegions, codes: codesOf('ukraine') })).toBe(false);
  });

  it('returns false on empty inputs', () => {
    expect(providerMatchesRegionFilter({ regions: [], codes: codesOf('euUk') })).toBe(false);
    expect(providerMatchesRegionFilter({ regions: walutomatRegions, codes: [] })).toBe(false);
  });
});
