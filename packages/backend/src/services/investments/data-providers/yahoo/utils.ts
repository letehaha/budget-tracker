import { ASSET_CLASS } from '@bt/shared/types/investments';

// ISO 6166 ISIN: 2-letter country code, 9 alphanumerics, 1 check digit.
// The check digit isn't validated – we only need to know whether the
// ISIN-fallback path is worth trying.
export const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

// Yahoo exchange suffixes the ISIN-fallback path fans out to. Yahoo's `quote`
// endpoint indexes UCITS funds by `<ISIN><suffix>` on these venues even though
// the bare ISIN is not searchable.
export const ISIN_EXCHANGE_SUFFIXES = ['.IR', '.DE', '.PA', '.AS', '.MI', '.L'] as const;

/**
 * Returns true when a quote() rejection is the routine "symbol doesn't exist
 * on this venue" case (404 HTTPError, NotFoundError, "not found" message).
 * Anything else – timeout, auth, rate-limit, schema validation – is operational
 * and the caller should surface it at error level so it isn't masked as routine.
 */
export function isExpectedNotFoundError(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false;
  const err = reason as { name?: string; message?: string; code?: number | string };
  if (err.code === 404 || err.code === '404') return true;
  if (typeof err.name === 'string' && err.name.toLowerCase().includes('notfound')) return true;
  if (typeof err.message === 'string' && /not\s*found/i.test(err.message)) return true;
  return false;
}

/**
 * Yahoo tags UCITS ETFs as `MUTUALFUND` even though they trade intraday with a
 * ticker. For ISIN-shaped queries the result set is exchange-traded-only by
 * construction, so the remap to `etf` is safe and routes them through the
 * stocks classifier instead of the fixed-income classifier where real mutuals
 * belong. Non-ISIN queries keep the original type so the service-layer filter
 * still drops genuine mutuals.
 */
export function remapUcitsType({
  rawType,
  isIsinQuery,
}: {
  rawType: string | undefined;
  isIsinQuery: boolean;
}): string | undefined {
  if (!isIsinQuery) return rawType;
  if (typeof rawType === 'string' && rawType.toLowerCase() === 'mutualfund') return 'etf';
  return rawType;
}

export function mapYahooTypeToAssetClass(typeDisp?: string): ASSET_CLASS {
  if (!typeDisp) return ASSET_CLASS.stocks;

  const type = typeDisp.toLowerCase();

  if (type === 'cryptocurrency') return ASSET_CLASS.crypto;
  if (type === 'option') return ASSET_CLASS.options;
  if (type === 'bond' || type === 'mutualfund') return ASSET_CLASS.fixed_income;

  return ASSET_CLASS.stocks;
}
