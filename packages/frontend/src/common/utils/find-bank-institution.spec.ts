import { describe, expect, it } from 'vitest';

import { getBankInstitutionLogoUrl } from './find-bank-institution';

describe('getBankInstitutionLogoUrl', () => {
  it('returns a logo URL for an exact bank name match', () => {
    const url = getBankInstitutionLogoUrl({ bankName: 'PKO Bank Polski' });

    expect(url).not.toBeNull();
    expect(url).toContain('pkobp.pl');
  });

  it('returns a logo URL for a fuzzy match', () => {
    const url = getBankInstitutionLogoUrl({ bankName: 'Wise' });

    expect(url).not.toBeNull();
    expect(url).toContain('wise.com');
  });

  it('returns a logo URL for an alias match', () => {
    const url = getBankInstitutionLogoUrl({ bankName: 'transferwise' });

    expect(url).not.toBeNull();
    expect(url).toContain('wise.com');
  });

  it('returns null for an unknown bank name', () => {
    const url = getBankInstitutionLogoUrl({ bankName: 'Nonexistent Bank XYZ 12345' });

    expect(url).toBeNull();
  });

  it('returns null for an empty string', () => {
    const url = getBankInstitutionLogoUrl({ bankName: '' });

    expect(url).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    const url = getBankInstitutionLogoUrl({ bankName: '   ' });

    expect(url).toBeNull();
  });
});
