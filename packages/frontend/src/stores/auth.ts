import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { UnexpectedError } from '@/js/errors';
import { authClient, getSession, signIn, signOut, signUp } from '@/lib/auth-client';
import { useCategoriesStore, useCurrenciesStore, useUserStore } from '@/stores';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

import { resetAllDefinedStores } from './setup';

const HAS_EVER_LOGGED_IN_KEY = 'has-ever-logged-in';

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

    isLoggedIn.value = true;
    localStorage.setItem(HAS_EVER_LOGGED_IN_KEY, 'true');
  };

  /**
   * Login with Google OAuth
   * @param from - The page to redirect back to on error ('signin' or 'signup')
   */
  const loginWithGoogle = async ({ from = 'signin' }: { from?: 'signin' | 'signup' } = {}) => {
    // Store origin in sessionStorage for redirect after OAuth callback
    sessionStorage.setItem('oauth_from', from);

    const result = await signIn.social({
      provider: 'google',
      callbackURL: `${window.location.origin}/auth/callback`,
    });

    if (result.error) {
      throw new UnexpectedError(result.error.message || 'Google login failed');
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
   * Logout the current user
   */
  const logout = async () => {
    try {
      await signOut();
    } catch {
      // Ignore signout errors, we still want to clear local state
    }

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
    loginWithGoogle,
    loginWithPasskey,
    registerPasskey,
    signup,
    logout,
  };
});
