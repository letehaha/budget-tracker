import { useAuthStore, useCurrenciesStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { NavigationGuard } from 'vue-router';

export const authPageGuard: NavigationGuard = async (to, from, next): Promise<void> => {
  const authStore = useAuthStore();

  // Wait for session to be checked on app startup
  if (!authStore.isSessionChecked) {
    await authStore.validateSession();
  }

  // With better-auth, we use session cookies instead of localStorage tokens
  if (authStore.isLoggedIn) {
    next('/dashboard');
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
  const authStore = useAuthStore();

  // Wait for session to be checked on app startup
  if (!authStore.isSessionChecked) {
    await authStore.validateSession();
  }

  // With better-auth, session validation is done via cookies
  if (authStore.isLoggedIn) {
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
