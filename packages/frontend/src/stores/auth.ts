import { api, authLogin, authRegister } from '@/api';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { ApiErrorResponseError, UnexpectedError } from '@/js/errors';
import { useCategoriesStore, useCurrenciesStore, useUserStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types/api';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { Ref, ref, watch } from 'vue';

import { resetAllDefinedStores } from './setup';

const HAS_EVER_LOGGED_IN_KEY = 'has-ever-logged-in';

export const useAuthStore = defineStore('auth', () => {
  const userStore = useUserStore();
  const categoriesStore = useCategoriesStore();
  const currenciesStore = useCurrenciesStore();
  const queryClient = useQueryClient();

  const isLoggedIn = ref(false);
  const userToken: Ref<string | null> = ref(null);
  const isReturningUser = Boolean(localStorage.getItem(HAS_EVER_LOGGED_IN_KEY));

  const login = async ({ password, username }: { password: string; username: string }) => {
    try {
      const result = await authLogin({
        password,
        username,
      });

      if (result.token) {
        api.setToken(result.token);

        await userStore.loadUser();
        await Promise.all([currenciesStore.loadBaseCurrency(), categoriesStore.loadCategories()]);

        isLoggedIn.value = true;
        userToken.value = result.token;
        localStorage.setItem('user-token', result.token);
        localStorage.setItem(HAS_EVER_LOGGED_IN_KEY, 'true');
      }
    } catch (e) {
      if (e instanceof ApiErrorResponseError) {
        const possibleErrorCodes: API_ERROR_CODES[] = [API_ERROR_CODES.notFound, API_ERROR_CODES.invalidCredentials];

        if (possibleErrorCodes.includes(e.data.code)) {
          throw e;
        }
      }

      throw new UnexpectedError();
    }
  };

  const setLoggedIn = async () => {
    await Promise.all([currenciesStore.loadBaseCurrency(), categoriesStore.loadCategories()]);

    isLoggedIn.value = true;
  };

  /**
   * Validates the current session by checking if the stored token is still valid.
   * If the token exists, it attempts to load user data from the backend.
   * If the token is invalid (401), the API handler will automatically clear it.
   * This is used on public pages (like landing) to verify auth state without redirecting.
   */
  const validateSession = async (): Promise<boolean> => {
    const token = localStorage.getItem('user-token');

    if (!token) {
      return false;
    }

    try {
      api.setToken(token);
      await userStore.loadUser();
      await setLoggedIn();
      return true;
    } catch {
      isLoggedIn.value = false;
      return false;
    }
  };

  const signup = async ({ password, username }: { password: string; username: string }) => {
    await authRegister({ password, username });
    await login({ password, username });
  };

  const logout = () => {
    // Clear authentication first
    api.setToken('');
    localStorage.removeItem('user-token');
    isMobileSheetOpen.value = false;
    // Set logged out state before resetting stores to prevent watcher from triggering query invalidation
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
    userToken,
    isReturningUser,

    setLoggedIn,
    validateSession,
    login,
    signup,
    logout,
  };
});
