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

const LOGO_DEV_TICKER_BASE = 'https://img.logo.dev/ticker';
const LOGO_DEV_DEFAULT_SIZE = 64;

export const getSecurityLogoUrl = ({ symbol, assetClass, logoUrl }: SecurityLogoSource): string | null => {
  if (logoUrl) return logoUrl;

  if (assetClass === ASSET_CLASS.stocks && symbol) {
    const token = import.meta.env.VITE_LOGO_DEV_TOKEN;
    // Without a token logo.dev returns 403 — better to skip the request entirely
    // than serve a broken <img> that silently hides via the error fallback.
    if (!token) return null;
    const encodedSymbol = encodeURIComponent(symbol);
    return `${LOGO_DEV_TICKER_BASE}/${encodedSymbol}?token=${token}&size=${LOGO_DEV_DEFAULT_SIZE}&format=png&retina=true`;
  }

  return null;
};
