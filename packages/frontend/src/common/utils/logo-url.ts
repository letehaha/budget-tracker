/**
 * Builds a logo.dev CDN URL for a brand domain. Shared by every feature that
 * renders brand logos (subscriptions, bank institutions, payees), so it lives
 * in a feature-neutral util rather than under any one of them.
 *
 * Returns null when no logo.dev token is configured: without a token logo.dev
 * responds 401, so skipping the request avoids rendering an <img> that 401s for
 * every visible logo.
 */
export function getServiceLogoUrl({ domain }: { domain: string }): string | null {
  const token = import.meta.env.VITE_LOGO_DEV_TOKEN;
  if (!token) return null;
  return `https://img.logo.dev/${domain}?token=${token}&format=png&size=64`;
}
