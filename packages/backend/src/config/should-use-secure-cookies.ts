/**
 * Decides whether better-auth may mark its session cookies `Secure` (which
 * also switches them to the `__Secure-` name prefix).
 *
 * Browsers reject Secure cookies set over plain-http non-localhost origins:
 * the Set-Cookie header is silently dropped, so login appears to succeed but
 * the session never persists. Self-hosted trials legitimately run production
 * builds over plain http (e.g. `http://192.168.1.20:8080`), so the scheme of
 * the URL the app is served at (`BETTER_AUTH_URL`) — not the build
 * environment — decides whether cookies can be Secure.
 *
 * Secure cookies are therefore enabled only when BOTH hold:
 *  - `nodeEnv` is `production` (dev/test always use plain cookies), and
 *  - `betterAuthUrl` is an https URL.
 *
 * A missing, empty, or malformed `betterAuthUrl` yields `false`: when the
 * served scheme is unknown, plain cookies are the only variant guaranteed to
 * reach the browser.
 */
export function shouldUseSecureCookies({
  nodeEnv,
  betterAuthUrl,
}: {
  nodeEnv: string | undefined;
  betterAuthUrl: string | undefined;
}): boolean {
  if (nodeEnv !== 'production') return false;
  return (betterAuthUrl ?? '').trim().toLowerCase().startsWith('https://');
}
