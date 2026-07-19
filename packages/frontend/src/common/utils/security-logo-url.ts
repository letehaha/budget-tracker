import { config } from '@/common/config';
import { ASSET_CLASS } from '@bt/shared/types/investments';

/**
 * Accepts both shapes the codebase uses: `SecurityModel` (logoUrl: string | null)
 * and `SecuritySearchResult` (logoUrl?: string | null). Marking it optional +
 * nullable means call sites can pass either without coalescing.
 */
export interface SecurityLogoSource {
  symbol: string | null;
  assetClass: ASSET_CLASS;
  logoUrl?: string | null;
}

const LOGO_DEV_BASE = 'https://img.logo.dev';
const LOGO_DEV_DEFAULT_SIZE = 64;

const buildLogoDevUrl = ({ path, symbol }: { path: 'ticker' | 'crypto'; symbol: string }): string | null => {
  const token = config.logoDevToken;
  // Without a token logo.dev returns 403 — better to skip the request entirely
  // than serve a broken <img> that silently hides via the error fallback.
  if (!token) return null;
  const encodedSymbol = encodeURIComponent(symbol);
  return `${LOGO_DEV_BASE}/${path}/${encodedSymbol}?token=${token}&size=${LOGO_DEV_DEFAULT_SIZE}&format=png&retina=true`;
};

export const getSecurityLogoUrl = ({ symbol, assetClass, logoUrl }: SecurityLogoSource): string | null => {
  if (logoUrl) return logoUrl;

  if (assetClass === ASSET_CLASS.stocks && symbol) {
    return buildLogoDevUrl({ path: 'ticker', symbol });
  }

  if (assetClass === ASSET_CLASS.crypto && symbol) {
    // CoinGecko is the primary source (broader altcoin coverage). logo.dev's
    // crypto dataset is a fallback for popular coins when the stored URL is
    // missing; unsupported tickers 404 and the <img> error handler hides them.
    return buildLogoDevUrl({ path: 'crypto', symbol: symbol.toLowerCase() });
  }

  return null;
};
