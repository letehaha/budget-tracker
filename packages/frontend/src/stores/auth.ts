import { startDemo as startDemoApi } from '@/api/demo';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { UnexpectedError } from '@/js/errors';
import { authClient, getSession, signIn, signOut, signUp } from '@/lib/auth-client';
import { identifyUser, resetUser } from '@/lib/posthog';
import { clearSentryUser, setSentryUser } from '@/lib/sentry';
import { useCategoriesStore, useCurrenciesStore, useUserStore } from '@/stores';
import { OAUTH_PROVIDER, UserModel } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

import { resetAllDefinedStores } from './setup';

/**
 * Identify user for analytics and error tracking
 */
function identifyUserForTracking(user: UserModel) {
  // PostHog analytics
  identifyUser({
    userId: user.id,
    email: user.email,
    username: user.username,
  });

  // Sentry error tracking
  setSentryUser({
    userId: user.id,
    email: user.email,
    username: user.username,
  });
}

const HAS_EVER_LOGGED_IN_KEY = 'has-ever-logged-in';
const DEMO_SESSION_KEY = 'demo-session';

// Demo session expires after 4 hours (same as backend)
export const DEMO_EXPIRY_HOURS = 4;

interface DemoSession {
  startedAt: number; // timestamp
  userId: number;
}

export const useAuthStore = defineStore('auth', () => {
  const userStore = useUserStore();
  const categoriesStore = useCategoriesStore();
  const currenciesStore = useCurrenciesStore();
  const queryClient = useQueryClient();

  const isLoggedIn = ref(false);
  const isSessionChecked = ref(false);
  const isReturningUser = Boolean(localStorage.getItem(HAS_EVER_LOGGED_IN_KEY));

  /**
   * Loads initial data after authentication (currencies, categories)
   */
  const loadPostAuthData = async () => {
    await Promise.all([currenciesStore.loadBaseCurrency(), categoriesStore.loadCategories()]);
  };

  /**
   * Sets the logged in state and loads necessary data
   */
  const setLoggedIn = async () => {
    await loadPostAuthData();
    isLoggedIn.value = true;
  };

  /**
   * Login with email and password
   */
  const login = async ({ email, password }: { email: string; password: string }) => {
    const result = await signIn.email({
      email,
      password,
    });

    if (result.error) {
      throw new UnexpectedError(result.error.message || 'Login failed');
    }

    await userStore.loadUser();
    await loadPostAuthData();

    // Identify user for analytics and error tracking
    if (userStore.user) {
      identifyUserForTracking(userStore.user);
    }

    isLoggedIn.value = true;
    localStorage.setItem(HAS_EVER_LOGGED_IN_KEY, 'true');
  };

  /**
   * Legacy login with username (for migrated users from old auth system)
   * Uses @app.migrated email suffix
   */
  const legacyLogin = async ({ password, username }: { password: string; username: string }) => {
    const email = `${username}@app.migrated`;

    const result = await signIn.email({
      email,
      password,
    });

    if (result.error) {
      throw new UnexpectedError(result.error.message || 'Login failed');
    }

    await userStore.loadUser();
    await loadPostAuthData();

    // Identify user for analytics and error tracking
    if (userStore.user) {
      identifyUserForTracking(userStore.user);
    }

    isLoggedIn.value = true;
    localStorage.setItem(HAS_EVER_LOGGED_IN_KEY, 'true');
  };

  /**
   * Login with OAuth provider
   * @param provider - The OAuth provider
   * @param from - The page to redirect back to on error ('signin' or 'signup')
   */
  const loginWithOAuth = async ({
    provider,
    from = 'signin',
  }: {
    provider: OAUTH_PROVIDER;
    from?: 'signin' | 'signup';
  }) => {
    sessionStorage.setItem('oauth_from', from);

    const result = await signIn.social({
      provider,
      callbackURL: `${window.location.origin}/auth/callback`,
    });

    if (result.error) {
      throw new UnexpectedError(result.error.message || `${provider} login failed`);
    }
  };

  /**
   * Login with passkey (WebAuthn)
   */
  const loginWithPasskey = async () => {
    const result = await authClient.signIn.passkey();

    if (result.error) {
      throw new UnexpectedError(result.error.message || 'Passkey login failed');
    }

    await userStore.loadUser();
    await loadPostAuthData();

    // Identify user for analytics and error tracking
    if (userStore.user) {
      identifyUserForTracking(userStore.user);
    }

    isLoggedIn.value = true;
    localStorage.setItem(HAS_EVER_LOGGED_IN_KEY, 'true');
  };

  /**
   * Register a new passkey for the current user
   */
  const registerPasskey = async ({ name }: { name?: string } = {}) => {
    const result = await authClient.passkey.addPasskey({
      name: name || 'My Passkey',
    });

    if (result.error) {
      throw new UnexpectedError(result.error.message || 'Failed to register passkey');
    }

    return result;
  };

  /**
   * Validates the current session by checking with better-auth.
   * Sets isSessionChecked to true after validation attempt.
   */
  const validateSession = async (): Promise<boolean> => {
    try {
      const session = await getSession();

      if (!session?.data?.session) {
        isSessionChecked.value = true;
        return false;
      }

      await userStore.loadUser();
      await setLoggedIn();

      // Identify user for analytics and error tracking
      if (userStore.user) {
        identifyUserForTracking(userStore.user);
      }

      isSessionChecked.value = true;
      return true;
    } catch {
      isLoggedIn.value = false;
      isSessionChecked.value = true;
      return false;
    }
  };

  /**
   * Sign up with email and password.
   * Note: Does NOT auto-login - user must verify email first (if email verification is enabled).
   * After email verification, user is auto-signed in and redirected to /auth/callback.
   */
  const signup = async ({ email, password, name }: { email: string; password: string; name?: string }) => {
    const result = await signUp.email({
      email,
      password,
      name: name || email.split('@')[0],
      // Callback URL after email verification - goes to auth callback which validates session
      callbackURL: `${window.location.origin}/auth/callback`,
    });

    if (result.error) {
      throw new UnexpectedError(result.error.message || 'Signup failed');
    }

    // Don't auto-login - user needs to verify email first
    // The register page will redirect to verify-email page
  };

  /**
   * Start a demo session.
   * Creates a temporary demo user with pre-seeded data.
   * Demo users are automatically cleaned up after 4 hours or on logout.
   */
  const startDemo = async () => {
    const response = await startDemoApi();

    // Store user data
    userStore.user = response.user;

    // Store demo session info in LocalStorage for page refresh handling
    const demoSession: DemoSession = {
      startedAt: Date.now(),
      userId: response.user.id,
    };
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoSession));

    // Load post-auth data (currencies, categories)
    await loadPostAuthData();

    // Identify for analytics (using demo- prefix to distinguish)
    if (userStore.user) {
      identifyUserForTracking(userStore.user);
    }

    isLoggedIn.value = true;
    // Don't set HAS_EVER_LOGGED_IN_KEY for demo users
  };

  /**
   * Get the current demo session info from LocalStorage.
   * Returns null if no demo session exists.
   */
  const getDemoSession = (): DemoSession | null => {
    const stored = localStorage.getItem(DEMO_SESSION_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as DemoSession;
    } catch {
      return null;
    }
  };

  /**
   * Clear demo session from LocalStorage.
   * Called on logout.
   */
  const clearDemoSession = () => {
    localStorage.removeItem(DEMO_SESSION_KEY);
  };

  /**
   * Logout the current user
   */
  const logout = async () => {
    try {
      await signOut();
    } catch {
      // Ignore signout errors, we still want to clear local state
    }

    // Reset analytics and error tracking user context
    resetUser();
    clearSentryUser();

    // Clear demo session from LocalStorage
    clearDemoSession();

    isMobileSheetOpen.value = false;
    // Set logged out state before resetting stores
    isLoggedIn.value = false;
    // Cancel all queries before resetting stores to prevent refetching
    queryClient.cancelQueries();
    resetAllDefinedStores();
  };

  watch(isLoggedIn, (newValue) => {
    // Only invalidate queries when logging IN, not when logging out
    if (newValue) {
      queryClient.invalidateQueries();
    }
  });

  return {
    isLoggedIn,
    isSessionChecked,
    isReturningUser,

    setLoggedIn,
    validateSession,
    login,
    legacyLogin,
    loginWithOAuth,
    loginWithPasskey,
    registerPasskey,
    signup,
    startDemo,
    getDemoSession,
    logout,
  };
});
