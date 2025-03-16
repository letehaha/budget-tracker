import { api } from '@/api/_api';
import { useAuthStore, useCurrenciesStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { NavigationGuard } from 'vue-router';

export const authPageGuard: NavigationGuard = (to, from, next): void => {
  const token = localStorage.getItem('user-token') || '';

  if (useAuthStore().isLoggedIn || token) {
    api.setToken(token);
    next('/');
  } else {
    next();
  }
};

export const baseCurrencyExists: NavigationGuard = (to, from, next): void => {
  const { isBaseCurrencyExists } = storeToRefs(useCurrenciesStore());

  if (!isBaseCurrencyExists.value) {
    next('/welcome');
  } else {
    next();
  }
};

export const redirectRouteGuard: NavigationGuard = async (to, from, next): Promise<void> => {
  const token = localStorage.getItem('user-token') || '';
  const authStore = useAuthStore();

  if (token) {
    api.setToken(token);
    await authStore.setLoggedIn();
    next();
  } else {
    next({
      path: '/sign-in',
      query: { redirect: to.fullPath },
    });
  }
};

export const devOnly: NavigationGuard = (to, from, next): void => {
  if (process.env.NODE_ENV === 'development') {
    next();
  } else {
    next('/');
  }
};
