import { startDemo as startDemoApi } from '@/api/demo';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { OAuthProviderNotConfiguredError, UnexpectedError } from '@/js/errors';
import { authClient, getSession, signIn, signOut, signUp } from '@/lib/auth-client';
import { identifyUser, resetUser } from '@/lib/posthog';
import { collectPersistedQueryGarbage, resetQueryCaches } from '@/lib/query-persister';
import { clearSentryUser, setSentryUser } from '@/lib/sentry';
import { useCategoriesStore, useCurrenciesStore, useUserStore } from '@/stores';
import { OAUTH_PROVIDER, USER_ROLES, UserModel } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

import { resetAllDefinedStores } from './setup';

/**
 * Identify user for analytics and error tracking
 */
function identifyUserForTracking(user: UserModel) {
  const isDemo = user.role === USER_ROLES.demo;

  // PostHog analytics
  identifyUser({
    userId: user.id,
    email: user.email,
    username: user.username,
    properties: {
      is_demo: isDemo,
      user_role: user.role,
    },
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
// Identity of the user whose queries are currently persisted on this device.
// Compared on every auth entry so a session swap without an explicit logout
// (expiry, logging into a different account) can't restore the prior user's data.
const PERSISTED_QUERIES_USER_KEY = 'persisted-queries-user-id';

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
   * Drop persisted (IndexedDB) and in-memory query caches when the authenticated
   * user differs from the one whose data was last persisted on this device. Runs
   * before any persisted query mounts so a fresh account never restores another's
   * cached lists. No-op on first login and when the same user returns.
   */
  const reconcilePersistedQueriesForUser = async () => {
    const currentUserId = userStore.user?.id;
    if (currentUserId == null) return;

    const currentUserIdStr = String(currentUserId);
    const lastSeenUserId = localStorage.getItem(PERSISTED_QUERIES_USER_KEY);

    if (lastSeenUserId !== null && lastSeenUserId !== currentUserIdStr) {
      await resetQueryCaches(queryClient);
    }

    localStorage.setItem(PERSISTED_QUERIES_USER_KEY, currentUserIdStr);
  };

  /**
   * Loads initial data after authentication (currencies, categories)
   */
  const loadPostAuthData = async () => {
    await reconcilePersistedQueriesForUser();
    // Sweep abandoned persisted-query rows (see `collectPersistedQueryGarbage`);
    // not awaited – nothing below depends on it.
    void collectPersistedQueryGarbage();
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
      // better-auth removes providers whose credentials env vars aren't set from
      // its enabled set, so a sign-in attempt for one of them answers 404 /
      // PROVIDER_NOT_FOUND. Surface that as a distinct error so the UI can tell
      // the user the provider isn't configured rather than "please try again".
      const { status, code } = result.error as { status?: number; code?: string };
      if (code === 'PROVIDER_NOT_FOUND' || status === 404) {
        throw new OAuthProviderNotConfiguredError(provider);
      }
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
      name: name || email.split('@')[0]!,
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
    // Cancel in-flight queries, drop the in-memory cache, and wipe the on-device
    // persisted store so no financial data survives logout on a shared device.
    await resetQueryCaches(queryClient);
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
    loginWithOAuth,
    loginWithPasskey,
    registerPasskey,
    signup,
    startDemo,
    getDemoSession,
    logout,
  };
});
