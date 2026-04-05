import { getOAuthAuthorizeUrl } from '@/api/mcp';
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
