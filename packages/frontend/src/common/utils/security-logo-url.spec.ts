import { ASSET_CLASS } from '@bt/shared/types/investments';
import { describe, expect, it, vi } from 'vitest';

import { getSecurityLogoUrl } from './security-logo-url';

vi.stubEnv('VITE_LOGO_DEV_TOKEN', 'test-token');

describe('getSecurityLogoUrl', () => {
  it('returns the provider-supplied URL when present (crypto from CoinGecko)', () => {
    const url = getSecurityLogoUrl({
      symbol: 'BTC',
      assetClass: ASSET_CLASS.crypto,
      logoUrl: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png',
    });

    expect(url).toBe('https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png');
  });

  it('prefers provider URL over logo.dev derivation for stocks', () => {
    const url = getSecurityLogoUrl({
      symbol: 'AAPL',
      assetClass: ASSET_CLASS.stocks,
      logoUrl: 'https://explicit.example.com/aapl.png',
    });

    expect(url).toBe('https://explicit.example.com/aapl.png');
  });

  it('derives a logo.dev ticker URL for stocks without a provider URL', () => {
    const url = getSecurityLogoUrl({
      symbol: 'AAPL',
      assetClass: ASSET_CLASS.stocks,
      logoUrl: null,
    });

    expect(url).toContain('https://img.logo.dev/ticker/AAPL');
    expect(url).toContain('token=test-token');
    expect(url).toContain('format=png');
    expect(url).toContain('retina=true');
  });

  it('URL-encodes symbols that contain special characters (e.g. LSE tickers with dots)', () => {
    const url = getSecurityLogoUrl({
      symbol: 'VWRA.L',
      assetClass: ASSET_CLASS.stocks,
      logoUrl: null,
    });

    expect(url).toContain('/ticker/VWRA.L');
  });

  it('falls back to logo.dev crypto URL for crypto without a provider URL', () => {
    // CoinGecko is the primary source; logo.dev's crypto dataset only covers
    // popular coins, so unsupported tickers will 404 and the <img> error
    // handler hides them. Still strictly better than rendering nothing.
    const url = getSecurityLogoUrl({
      symbol: 'BTC',
      assetClass: ASSET_CLASS.crypto,
      logoUrl: null,
    });

    expect(url).toContain('https://img.logo.dev/crypto/btc');
    expect(url).toContain('token=test-token');
    expect(url).toContain('format=png');
    expect(url).toContain('retina=true');
  });

  it('lowercases the symbol when building the logo.dev crypto URL', () => {
    // logo.dev's crypto endpoint expects lowercase symbols (e.g. /crypto/eth).
    const url = getSecurityLogoUrl({
      symbol: 'ETH',
      assetClass: ASSET_CLASS.crypto,
      logoUrl: null,
    });

    expect(url).toContain('/crypto/eth');
    expect(url).not.toContain('/crypto/ETH');
  });

  it('returns null for a stock with no symbol', () => {
    const url = getSecurityLogoUrl({
      symbol: null,
      assetClass: ASSET_CLASS.stocks,
      logoUrl: null,
    });

    expect(url).toBeNull();
  });

  it('returns null for asset classes we do not handle yet (e.g. fixed_income, options)', () => {
    const url = getSecurityLogoUrl({
      symbol: 'BOND123',
      assetClass: ASSET_CLASS.fixed_income,
      logoUrl: null,
    });

    expect(url).toBeNull();
  });

  it('accepts inputs that omit logoUrl entirely (treated as no logo)', () => {
    // SecuritySearchResult marks logoUrl optional; call sites pass the raw
    // object without coalescing. Verify the resolver tolerates undefined.
    const url = getSecurityLogoUrl({
      symbol: 'AAPL',
      assetClass: ASSET_CLASS.stocks,
    });

    expect(url).toContain('/ticker/AAPL');
  });

  it('returns null for stocks when VITE_LOGO_DEV_TOKEN is missing', () => {
    // Without a token logo.dev returns 403; avoid producing a URL we know
    // will fail rather than relying on the <img> error handler to hide it.
    vi.stubEnv('VITE_LOGO_DEV_TOKEN', '');

    const url = getSecurityLogoUrl({
      symbol: 'AAPL',
      assetClass: ASSET_CLASS.stocks,
      logoUrl: null,
    });

    expect(url).toBeNull();

    vi.stubEnv('VITE_LOGO_DEV_TOKEN', 'test-token');
  });
});
