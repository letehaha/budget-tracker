import { getOAuthAuthorizeUrl } from '@/api/mcp';
import { useAuthStore, useCurrenciesStore, useUserStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { NavigationGuard } from 'vue-router';

import { ROUTES_NAMES } from './constants';

export const billingPageGuard: NavigationGuard = async (to, from, next): Promise<void> => {
  const authStore = useAuthStore();

  // canSeeBilling reads the user's role, so the session (which loads the user) must settle first.
  if (!authStore.isSessionChecked) {
    await authStore.validateSession();
  }

  const { canSeeBilling } = storeToRefs(useUserStore());

  if (!canSeeBilling.value) {
    next({ name: ROUTES_NAMES.settings });
  } else {
    next();
  }
};

export const authPageGuard: NavigationGuard = async (to, from, next): Promise<void> => {
  const authStore = useAuthStore();

  if (!authStore.isSessionChecked) {
    await authStore.validateSession();
  }

  if (authStore.isLoggedIn) {
    // If arriving from an OAuth authorize flow (e.g. Claude.ai MCP), skip the
    // login page and redirect straight to better-auth's authorize endpoint so
    // the user goes to the consent screen.
    if (to.query.response_type && to.query.client_id) {
      const queryParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(to.query)) {
        if (value) queryParams[key] = String(value);
      }
      window.location.href = getOAuthAuthorizeUrl({ queryParams });
      return;
    }
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

  if (!authStore.isSessionChecked) {
    await authStore.validateSession();
  }

  if (authStore.isLoggedIn) {
    next();
  } else {
    next({
      path: '/sign-in',
      query: { redirect: to.fullPath },
    });
  }
};
