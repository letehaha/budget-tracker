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

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [passkeyClient()],
});

// Export commonly used methods for easier imports
export const { signIn, signUp, signOut, useSession, getSession, changeEmail } = authClient;

// Passkey methods from plugin
export const { passkey } = authClient;
