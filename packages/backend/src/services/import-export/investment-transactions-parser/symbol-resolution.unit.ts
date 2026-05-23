import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';

import { normaliseCurrency, providerForAssetClass } from './symbol-resolution.service';

describe('normaliseCurrency', () => {
  it('returns USD for all USD-pegged stablecoins', () => {
    for (const stable of ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'FDUSD', 'PYUSD', 'USD']) {
      expect(normaliseCurrency({ raw: stable })).toBe('USD');
    }
  });

  it('preserves recognised fiats', () => {
    for (const fiat of ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AED', 'UAH']) {
      expect(normaliseCurrency({ raw: fiat })).toBe(fiat);
    }
  });

  it('returns null for unknown / crypto-quoted tokens', () => {
    expect(normaliseCurrency({ raw: 'BTC' })).toBeNull();
    expect(normaliseCurrency({ raw: 'ETH' })).toBeNull();
    expect(normaliseCurrency({ raw: 'SOL' })).toBeNull();
    expect(normaliseCurrency({ raw: 'NEW_TOKEN' })).toBeNull();
  });

  it('returns null for empty / whitespace / null input', () => {
    expect(normaliseCurrency({ raw: null })).toBeNull();
    expect(normaliseCurrency({ raw: undefined })).toBeNull();
    expect(normaliseCurrency({ raw: '' })).toBeNull();
    expect(normaliseCurrency({ raw: '   ' })).toBeNull();
  });

  it('handles case insensitivity and trims', () => {
    expect(normaliseCurrency({ raw: '  usdt  ' })).toBe('USD');
    expect(normaliseCurrency({ raw: 'eur' })).toBe('EUR');
  });
});

describe('providerForAssetClass', () => {
  it('routes crypto to CoinGecko', () => {
    expect(providerForAssetClass({ assetClass: ASSET_CLASS.crypto })).toBe(SECURITY_PROVIDER.coingecko);
  });

  it('routes other classes to the composite provider', () => {
    expect(providerForAssetClass({ assetClass: ASSET_CLASS.stocks })).toBe(SECURITY_PROVIDER.composite);
  });
});
