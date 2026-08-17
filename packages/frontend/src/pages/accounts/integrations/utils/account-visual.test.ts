import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { formatIbanCompact, getAccountSecondaryMeta, resolveAccountVisual } from './account-visual';

describe('resolveAccountVisual', () => {
  it('prefers institution logo when present', () => {
    expect(
      resolveAccountVisual({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        type: 'checking',
        currency: 'USD',
        metadata: { institutionLogo: 'https://example.com/logo.png' },
      }),
    ).toEqual({ kind: 'logo', src: 'https://example.com/logo.png' });
  });

  it('returns card gradient for known monobank card types', () => {
    const visual = resolveAccountVisual({
      providerType: BANK_PROVIDER_TYPE.MONOBANK,
      type: 'black',
      currency: 'UAH',
    });
    expect(visual.kind).toBe('card');
  });

  it('falls back to currency chip for unknown monobank card types', () => {
    expect(
      resolveAccountVisual({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        type: 'someNewTier',
        currency: 'UAH',
      }),
    ).toEqual({ kind: 'currency', code: 'UAH' });
  });

  it('returns currency chip for providers without visuals', () => {
    expect(
      resolveAccountVisual({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        type: 'CACC',
        currency: 'eur',
      }),
    ).toEqual({ kind: 'currency', code: 'EUR' });
  });

  it('ignores empty logo strings', () => {
    expect(
      resolveAccountVisual({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        type: 'checking',
        currency: 'USD',
        metadata: { institutionLogo: '' },
      }).kind,
    ).toBe('currency');
  });
});

describe('formatIbanCompact', () => {
  it('truncates long IBANs to head and tail groups', () => {
    expect(formatIbanCompact({ iban: 'UA213223130000026007233566001' })).toBe('UA21 3223 ··· 6001');
  });

  it('strips whitespace before measuring', () => {
    expect(formatIbanCompact({ iban: 'UA21 3223 1300 0002 6007 2335 6600 1' })).toBe('UA21 3223 ··· 6001');
  });

  it('returns short values as-is', () => {
    expect(formatIbanCompact({ iban: 'LT12345678' })).toBe('LT12345678');
  });
});

describe('getAccountSecondaryMeta', () => {
  it('extracts iban and positive credit limit', () => {
    expect(getAccountSecondaryMeta({ metadata: { iban: 'UA21', creditLimit: 4000000 } })).toEqual({
      iban: 'UA21',
      creditLimitCents: 4000000,
    });
  });

  it('drops zero credit limit and missing iban', () => {
    expect(getAccountSecondaryMeta({ metadata: { creditLimit: 0 } })).toEqual({
      iban: null,
      creditLimitCents: null,
    });
  });

  it('handles absent metadata', () => {
    expect(getAccountSecondaryMeta({})).toEqual({ iban: null, creditLimitCents: null });
  });
});
