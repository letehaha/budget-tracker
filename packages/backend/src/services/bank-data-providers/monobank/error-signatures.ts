/**
 * Predicates over Monobank's error responses, kept free of runtime imports so
 * they stay unit-testable without pulling in Redis, i18n or the logger.
 */
const GEO_BLOCK_RESPONSE_PATTERNS = [/Change your IP/i, /Змініть IP/i];

/**
 * Monobank's edge (AWS ELB) rejects VPN / non-UA traffic with a plain-text 403
 * telling the user to change their IP, rather than the usual JSON body.
 */
export function isGeoBlockResponseBody(body: unknown): boolean {
  if (typeof body !== 'string') return false;
  return GEO_BLOCK_RESPONSE_PATTERNS.some((pattern) => pattern.test(body));
}

const UNKNOWN_ACCOUNT_DESCRIPTION = /^invalid\s+'account'$/i;

/**
 * The account id is not one this API token can see — the token now belongs to a
 * different Monobank client, or the account was closed. Matched narrowly so
 * other 400s (a malformed date range, say) stay on the retry + Sentry path.
 */
export function isUnknownAccountResponse({
  status,
  errorDescription,
}: {
  status: number | undefined;
  errorDescription: unknown;
}): boolean {
  if (status !== 400) return false;
  if (typeof errorDescription !== 'string') return false;
  return UNKNOWN_ACCOUNT_DESCRIPTION.test(errorDescription.trim());
}
