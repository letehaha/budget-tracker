import { API_HTTP, API_VER } from '@/api/api-base-url';
import { getCurrentLocale } from '@/i18n';
import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/vue';

/**
 * Better-auth Vue client instance.
 *
 * This client handles all authentication operations with the backend:
 * - Email/password authentication
 * - Google OAuth
 * - Passkey (WebAuthn) authentication
 * - Session management
 *
 * The client uses cookies for session management (no more JWT tokens in localStorage).
 */

// Determine the base URL for auth API. API_HTTP is '' in same-origin mode
// (regular fetches use relative URLs), but better-auth's createAuthClient
// requires an ABSOLUTE baseURL and throws "Invalid base URL" on a relative
// one — so fall back to the page origin, which same-origin mode targets
// anyway.
export const getBaseURL = () => `${API_HTTP || window.location.origin}${API_VER}/auth`;

// Create auth client with passkey plugin
// The passkey plugin adds: signIn.passkey, passkey.addPasskey, passkey.listUserPasskeys, etc.
export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [passkeyClient()],
  // Send current locale to backend for locale-aware operations (e.g., category creation)
  fetchOptions: {
    headers: {
      // Use a getter function to get the current locale at request time
      get 'Accept-Language'() {
        return getCurrentLocale();
      },
    },
  },
});

// Re-export signIn with passkey method for proper typing
// The passkey plugin extends signIn with the passkey method
export const { signIn, signUp, signOut, getSession } = authClient;

/**
 * Set password for OAuth-only accounts.
 * This endpoint exists on better-auth server but isn't typed on the client.
 * Requires authenticated session + fresh session (signed in recently).
 */
export const setPassword = (
  authClient as unknown as {
    setPassword: (params: { newPassword: string }) => Promise<{
      data?: { status: boolean };
      error?: { message: string };
    }>;
  }
).setPassword;
