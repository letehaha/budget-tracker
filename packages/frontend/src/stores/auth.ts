import { api, authLogin, authRegister } from '@/api';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { ApiErrorResponseError, UnexpectedError } from '@/js/errors';
import { useCategoriesStore, useCurrenciesStore, useUserStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types/api';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { Ref, ref, watch } from 'vue';

import { resetAllDefinedStores } from './setup';

export const useAuthStore = defineStore('auth', () => {
  const userStore = useUserStore();
  const categoriesStore = useCategoriesStore();
  const currenciesStore = useCurrenciesStore();
  const queryClient = useQueryClient();

  const isLoggedIn = ref(false);
  const userToken: Ref<string | null> = ref(null);

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

  const signup = async ({ password, username }: { password: string; username: string }) => {
    await authRegister({ password, username });
    await login({ password, username });
  };

  const logout = () => {
    api.setToken('');
    localStorage.setItem('user-token', '');
    isMobileSheetOpen.value = false;

    resetAllDefinedStores();
  };

  watch(isLoggedIn, () => queryClient.invalidateQueries());

  return {
    isLoggedIn,
    userToken,

    setLoggedIn,
    login,
    signup,
    logout,
  };
});
