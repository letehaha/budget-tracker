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

// Determine the base URL for auth API
const getBaseURL = () => {
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:8081/api/v1/auth`;
  }
  return `${import.meta.env.VITE_APP_API_HTTP}${import.meta.env.VITE_APP_API_VER}/auth`;
};

// Create auth client with passkey plugin
// The passkey plugin adds: signIn.passkey, passkey.addPasskey, passkey.listUserPasskeys, etc.
export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [passkeyClient()],
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
