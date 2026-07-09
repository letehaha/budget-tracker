import { OAUTH_PROVIDER } from '@bt/shared/types';

/**
 * Thrown when social sign-in is attempted for a provider the backend has no
 * credentials for. better-auth drops providers whose client id/secret env vars
 * aren't set from its enabled set, so the sign-in request comes back as a 404 /
 * `PROVIDER_NOT_FOUND`. We translate that into this typed error so the auth
 * pages can show a clear "not configured" message instead of the generic
 * "please try again" copy.
 */
export class OAuthProviderNotConfiguredError extends Error {
  provider: OAUTH_PROVIDER;

  constructor(provider: OAUTH_PROVIDER) {
    super(`OAuth provider "${provider}" is not configured on this server`);
    this.name = 'OAuthProviderNotConfiguredError';
    this.provider = provider;
  }
}
