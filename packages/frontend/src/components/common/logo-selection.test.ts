import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MONOGRAM_COLOR,
  type LogoSelection,
  logoSelectionKey,
  toLogoDisplayProps,
  toLogoPayload,
  toLogoSelection,
  toOptionalLogoPayload,
} from './logo-selection';

describe('toLogoSelection', () => {
  it('returns null when neither a domain nor initials are stored', () => {
    expect(toLogoSelection({ logoDomain: null, logoInitials: null, logoColor: null })).toBe(null);
    expect(toLogoSelection({})).toBe(null);
  });

  it('builds a brand selection from a stored domain', () => {
    expect(toLogoSelection({ logoDomain: 'netflix.com', logoInitials: null, logoColor: null })).toEqual({
      kind: 'brand',
      domain: 'netflix.com',
    });
  });

  it('builds a monogram selection from stored initials', () => {
    expect(toLogoSelection({ logoDomain: null, logoInitials: 'NF', logoColor: '#112233' })).toEqual({
      kind: 'monogram',
      initials: 'NF',
      color: '#112233',
    });
  });

  it('falls back to the default color for a monogram stored without one', () => {
    expect(toLogoSelection({ logoDomain: null, logoInitials: 'NF', logoColor: null })).toEqual({
      kind: 'monogram',
      initials: 'NF',
      color: DEFAULT_MONOGRAM_COLOR,
    });
  });

  it('prefers initials over a domain when both are stored', () => {
    expect(toLogoSelection({ logoDomain: 'netflix.com', logoInitials: 'NF', logoColor: '#112233' })).toEqual({
      kind: 'monogram',
      initials: 'NF',
      color: '#112233',
    });
  });
});

describe('toLogoPayload', () => {
  it('clears the domain and the monogram when nothing is selected', () => {
    expect(toLogoPayload({ selection: null })).toEqual({ logoDomain: null, logoInitials: null });
  });

  it('sends only the domain for a brand selection', () => {
    expect(toLogoPayload({ selection: { kind: 'brand', domain: 'netflix.com' } })).toEqual({
      logoDomain: 'netflix.com',
    });
  });

  it('sends initials with their color for a monogram selection', () => {
    expect(toLogoPayload({ selection: { kind: 'monogram', initials: 'NF', color: '#112233' } })).toEqual({
      logoInitials: 'NF',
      logoColor: '#112233',
    });
  });
});

describe('toOptionalLogoPayload', () => {
  it('contributes no keys when nothing is selected', () => {
    expect(toOptionalLogoPayload({ selection: null })).toEqual({});
    expect(Object.keys(toOptionalLogoPayload({ selection: null }))).toEqual([]);
  });

  it('contributes no keys when the selection is undefined', () => {
    expect(Object.keys(toOptionalLogoPayload({ selection: undefined }))).toEqual([]);
  });

  it('matches toLogoPayload for a brand selection', () => {
    const selection: LogoSelection = { kind: 'brand', domain: 'netflix.com' };
    expect(toOptionalLogoPayload({ selection })).toEqual(toLogoPayload({ selection }));
  });

  it('matches toLogoPayload for a monogram selection', () => {
    const selection: LogoSelection = { kind: 'monogram', initials: 'NF', color: '#112233' };
    expect(toOptionalLogoPayload({ selection })).toEqual(toLogoPayload({ selection }));
  });
});

describe('logoSelectionKey', () => {
  it('gives structurally equal selections the same key', () => {
    expect(logoSelectionKey({ selection: { kind: 'brand', domain: 'netflix.com' } })).toBe(
      logoSelectionKey({ selection: { kind: 'brand', domain: 'netflix.com' } }),
    );
    expect(logoSelectionKey({ selection: { kind: 'monogram', initials: 'NF', color: '#112233' } })).toBe(
      logoSelectionKey({ selection: { kind: 'monogram', initials: 'NF', color: '#112233' } }),
    );
  });

  it('gives distinct selections distinct keys', () => {
    const keys = [
      logoSelectionKey({ selection: null }),
      logoSelectionKey({ selection: { kind: 'brand', domain: 'netflix.com' } }),
      logoSelectionKey({ selection: { kind: 'brand', domain: 'spotify.com' } }),
      logoSelectionKey({ selection: { kind: 'monogram', initials: 'NF', color: '#112233' } }),
      logoSelectionKey({ selection: { kind: 'monogram', initials: 'SP', color: '#112233' } }),
      logoSelectionKey({ selection: { kind: 'monogram', initials: 'NF', color: '#445566' } }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not collide between a brand and a monogram carrying the same text', () => {
    expect(logoSelectionKey({ selection: { kind: 'brand', domain: 'nf' } })).not.toBe(
      logoSelectionKey({ selection: { kind: 'monogram', initials: 'nf', color: DEFAULT_MONOGRAM_COLOR } }),
    );
  });

  it('round-trips a stored logo to the same key regardless of the object rebuilt around it', () => {
    const stored = { logoDomain: null, logoInitials: 'NF', logoColor: '#112233' };
    expect(logoSelectionKey({ selection: toLogoSelection(stored) })).toBe(
      logoSelectionKey({ selection: toLogoSelection({ ...stored }) }),
    );
  });
});

describe('toLogoDisplayProps', () => {
  it('nulls every prop when nothing is selected', () => {
    expect(toLogoDisplayProps({ selection: null })).toEqual({ domain: null, initials: null, color: null });
  });

  it('exposes only the domain for a brand selection', () => {
    expect(toLogoDisplayProps({ selection: { kind: 'brand', domain: 'netflix.com' } })).toEqual({
      domain: 'netflix.com',
      initials: null,
      color: null,
    });
  });

  it('exposes initials with their color for a monogram selection', () => {
    expect(toLogoDisplayProps({ selection: { kind: 'monogram', initials: 'NF', color: '#112233' } })).toEqual({
      domain: null,
      initials: 'NF',
      color: '#112233',
    });
  });
});
