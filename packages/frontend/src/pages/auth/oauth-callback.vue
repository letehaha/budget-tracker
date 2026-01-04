<template>
  <div class="flex h-dvh items-center justify-center">
    <div class="text-center">
      <div v-if="isLoading" class="flex flex-col items-center gap-4">
        <div class="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
        <p class="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ROUTES_NAMES } from '@/routes/constants';
import { useAuthStore } from '@/stores';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const isLoading = ref(true);

/**
 * Maps OAuth error codes to user-friendly messages.
 */
const getErrorMessage = ({ error, isLinking }: { error: string; isLinking: boolean }): string => {
  const action = isLinking ? 'connection' : 'authentication';

  const errorMessages: Record<string, string> = {
    access_denied: `You cancelled the ${action}. Please try again.`,
    invalid_request: `Invalid ${action} request. Please try again.`,
    unauthorized_client: 'This application is not authorized. Please contact support.',
    server_error: `${isLinking ? 'Connection' : 'Authentication'} server error. Please try again later.`,
    temporarily_unavailable: 'Service is temporarily unavailable. Please try again later.',
  };

  return errorMessages[error] || 'Authentication failed. Please try again.';
};

/**
 * Gets the origin page from sessionStorage and cleans it up.
 */
const getOAuthOrigin = (): 'signin' | 'signup' => {
  const from = sessionStorage.getItem('oauth_from');
  sessionStorage.removeItem('oauth_from');
  return from === 'signup' ? 'signup' : 'signin';
};

/**
 * Gets the return URL for account linking flows (e.g., connecting Google from settings).
 */
const getReturnUrl = (): string | null => {
  const returnUrl = sessionStorage.getItem('oauth_return_url');
  sessionStorage.removeItem('oauth_return_url');
  return returnUrl;
};

/**
 * Determines which page to redirect to based on the origin.
 */
const getRedirectRoute = (from: 'signin' | 'signup'): string => {
  return from === 'signup' ? ROUTES_NAMES.signUp : ROUTES_NAMES.signIn;
};

onMounted(async () => {
  const error = route.query.error as string | undefined;
  const from = getOAuthOrigin();
  const returnUrl = getReturnUrl();

  // If there's an OAuth error, redirect back to the originating page with error message
  if (error) {
    const isLinking = Boolean(returnUrl);
    const errorMessage = getErrorMessage({ error, isLinking });

    // For account linking flows, redirect back to the return URL with error
    if (returnUrl) {
      router.replace({ path: returnUrl, query: { oauth_error: errorMessage } });
      return;
    }

    router.replace({
      name: getRedirectRoute(from),
      query: { oauth_error: errorMessage },
    });
    return;
  }

  // No error - try to validate session (OAuth succeeded)
  try {
    const isValid = await authStore.validateSession();

    if (isValid) {
      // If we have a return URL (account linking flow), go back there
      if (returnUrl) {
        router.replace({ path: returnUrl });
        return;
      }
      // Successfully authenticated, go to dashboard
      router.replace({ name: ROUTES_NAMES.home });
    } else {
      // Session not valid, redirect to sign-in
      router.replace({
        name: ROUTES_NAMES.signIn,
        query: { oauth_error: 'Authentication failed. Please try again.' },
      });
    }
  } catch {
    router.replace({
      name: ROUTES_NAMES.signIn,
      query: { oauth_error: 'Authentication failed. Please try again.' },
    });
  }
});
</script>
