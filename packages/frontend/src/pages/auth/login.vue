<template>
  <div class="flex h-dvh items-center justify-center px-6">
    <Card class="w-full max-w-112.5" as="form" @submit.prevent="isLegacyMode ? submitLegacy() : submit()">
      <card-header>
        <h1 class="text-center text-2xl font-semibold tracking-tight">Log in to account</h1>
      </card-header>
      <card-content class="grid gap-5">
        <!-- OAuth and Passkey buttons (only show for non-legacy mode) -->
        <template v-if="!isLegacyMode">
          <div class="grid gap-3">
            <OAuthButton :provider="OAUTH_PROVIDER.google" mode="signin" :is-loading="isOAuthLoading" @click="handleOAuthLogin({ provider: OAUTH_PROVIDER.google })">
              <template #icon>
                <GoogleIcon />
              </template>
            </OAuthButton>
            <OAuthButton :provider="OAUTH_PROVIDER.github" mode="signin" :is-loading="isOAuthLoading" @click="handleOAuthLogin({ provider: OAUTH_PROVIDER.github })">
              <template #icon>
                <GithubIcon />
              </template>
            </OAuthButton>
            <PasskeyButton mode="signin" :is-loading="isPasskeyLoading" @click="handlePasskeyLogin" />
          </div>

          <AuthDivider text="Or continue with email" />

          <!-- Email credentials form -->
          <form-wrapper :error="formError" class="grid gap-5">
            <input-field
              v-model="form.email"
              name="email"
              label="Email"
              type="email"
              placeholder="your@email.com"
              :disabled="isFormLoading"
              :error-message="getFieldErrorMessage('form.email')"
            />
            <input-field
              v-model="form.password"
              label="Password"
              placeholder="Your password"
              type="password"
              :disabled="isFormLoading"
              :error-message="getFieldErrorMessage('form.password')"
            />
          </form-wrapper>

          <div class="flex justify-center">
            <Button type="submit" :disabled="isFormLoading" class="w-full">
              {{ isFormLoading ? 'Loading...' : 'Log in' }}
            </Button>
          </div>

          <!-- Toggle to legacy mode -->
          <div class="border-t pt-4">
            <Button type="button" variant="outline" class="w-full" @click="switchToLegacyMode">
              Have a legacy account? Login with username
            </Button>
          </div>
        </template>

        <!-- Legacy username form -->
        <template v-else>
          <form-wrapper :error="legacyFormError" class="grid gap-5">
            <input-field
              v-model="legacyForm.username"
              name="legacy-username"
              label="Username"
              placeholder="ie. johnsnow"
              :disabled="isLegacyLoading"
              :error-message="getLegacyFieldErrorMessage('legacyForm.username')"
            />
            <input-field
              v-model="legacyForm.password"
              label="Password"
              placeholder="Your password"
              type="password"
              :disabled="isLegacyLoading"
              :error-message="getLegacyFieldErrorMessage('legacyForm.password')"
            />
          </form-wrapper>

          <div class="flex justify-center">
            <Button type="submit" :disabled="isLegacyLoading" class="w-full">
              {{ isLegacyLoading ? 'Loading...' : 'Log in with username' }}
            </Button>
          </div>

          <!-- Toggle back to email mode -->
          <div class="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="text-muted-foreground w-full"
              @click="switchToEmailMode"
            >
              Back to email login
            </Button>
          </div>
        </template>
      </card-content>
      <card-footer class="text-center text-sm">
        Don't have an account?

        <router-link :to="{ name: ROUTES_NAMES.signUp }">
          <Button as="span" variant="link"> Sign up </Button>
        </router-link>
      </card-footer>
    </Card>
  </div>
</template>

<script lang="ts" setup>
import { AuthDivider, GithubIcon, GoogleIcon, OAuthButton, PasskeyButton } from '@/components/auth';
import { InputField } from '@/components/fields';
import FormWrapper from '@/components/fields/form-wrapper.vue';
import { Button } from '@/components/lib/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/lib/ui/card';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormValidation } from '@/composable';
import { ApiErrorResponseError } from '@/js/errors';
import { email, minLength, required } from '@/js/helpers/validators';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAuthStore } from '@/stores';
import { API_ERROR_CODES, OAUTH_PROVIDER } from '@bt/shared/types';
import { Ref, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { login, legacyLogin, loginWithOAuth, loginWithPasskey } = authStore;
const { addErrorNotification } = useNotificationCenter();

// Map better-auth error codes to user-friendly messages
const BETTER_AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Incorrect email or password.',
  INVALID_PASSWORD: 'Incorrect password.',
  USER_NOT_FOUND: 'User not found.',
  EMAIL_NOT_VERIFIED: 'Please verify your email before signing in.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'No password set for this account. Try signing in with Google.',
};

// Toggle between email and legacy login modes
const isLegacyMode = ref(false);

// Email login form
const form = ref({
  email: '',
  password: '',
});
const isFormLoading = ref(false);
const formError: Ref<string | null> = ref(null);

// Legacy login form
const legacyForm = ref({
  username: '',
  password: '',
});
const isLegacyLoading = ref(false);
const legacyFormError: Ref<string | null> = ref(null);

// OAuth/Passkey loading states
const isOAuthLoading = ref(false);
const isPasskeyLoading = ref(false);

// Check for OAuth error from callback redirect
const oauthError = route.query.oauth_error as string | undefined;
if (oauthError) {
  formError.value = oauthError;
  // Clean up the URL without triggering a navigation
  router.replace({ name: ROUTES_NAMES.signIn });
}

// Email form validation
const { isFormValid, getFieldErrorMessage } = useFormValidation(
  { form },
  {
    form: {
      email: { required, email },
      password: {
        required,
        passwordMinLength: minLength(6),
      },
    },
  },
  undefined,
  {
    customValidationMessages: {
      passwordMinLength: 'Minimal length is 6.',
      email: 'Please enter a valid email address.',
    },
  },
);

// Legacy form validation
const { isFormValid: isLegacyFormValid, getFieldErrorMessage: getLegacyFieldErrorMessage } = useFormValidation(
  { legacyForm },
  {
    legacyForm: {
      username: { required },
      password: {
        required,
        passwordMinLength: minLength(6),
      },
    },
  },
  undefined,
  {
    customValidationMessages: {
      passwordMinLength: 'Minimal length is 6.',
    },
  },
);

watch(form.value, () => {
  formError.value = null;
});

watch(legacyForm.value, () => {
  legacyFormError.value = null;
});

// Mode switching - reset forms when switching
const switchToLegacyMode = () => {
  isLegacyMode.value = true;
  // Reset email form
  form.value.email = '';
  form.value.password = '';
  formError.value = null;
};

const switchToEmailMode = () => {
  isLegacyMode.value = false;
  // Reset legacy form
  legacyForm.value.username = '';
  legacyForm.value.password = '';
  legacyFormError.value = null;
};

const navigateAfterLogin = () => {
  const redirectPath = route.query.redirect?.toString() || ROUTES_NAMES.home;

  if (redirectPath.startsWith('/')) {
    router.push(redirectPath);
  } else {
    router.push({ name: ROUTES_NAMES.home });
  }
};

const submit = async () => {
  if (!isFormValid()) return;

  const { email: userEmail, password } = form.value;

  try {
    isFormLoading.value = true;
    await login({ email: userEmail, password });
    navigateAfterLogin();
  } catch (e) {
    const error = e as Error;

    // Check for our custom API errors
    if (e instanceof ApiErrorResponseError) {
      const errorCodes: Partial<{ [K in API_ERROR_CODES]: string }> = {
        [API_ERROR_CODES.notFound]: 'Incorrect email or password.',
        [API_ERROR_CODES.invalidCredentials]: 'Password is invalid.',
      };

      formError.value = errorCodes[e.data.code] || error.message || 'An error occurred.';
      return;
    }

    // Check for better-auth error codes
    for (const [code, message] of Object.entries(BETTER_AUTH_ERROR_MESSAGES)) {
      if (error.message?.includes(code)) {
        formError.value = message;
        return;
      }
    }

    formError.value = error.message || 'An error occurred. Please try again.';
  } finally {
    isFormLoading.value = false;
  }
};

const submitLegacy = async () => {
  if (!isLegacyFormValid()) return;

  const { password, username } = legacyForm.value;

  try {
    isLegacyLoading.value = true;
    await legacyLogin({ password, username });
    navigateAfterLogin();
  } catch (e) {
    const error = e as Error;

    // Check for our custom API errors
    if (e instanceof ApiErrorResponseError) {
      const errorCodes: Partial<{ [K in API_ERROR_CODES]: string }> = {
        [API_ERROR_CODES.notFound]: 'Incorrect username or password.',
        [API_ERROR_CODES.invalidCredentials]: 'Password is invalid.',
      };

      legacyFormError.value = errorCodes[e.data.code] || error.message || 'An error occurred.';
      return;
    }

    // Check for better-auth error codes
    for (const [code, message] of Object.entries(BETTER_AUTH_ERROR_MESSAGES)) {
      if (error.message?.includes(code)) {
        legacyFormError.value = message;
        return;
      }
    }

    legacyFormError.value = error.message || 'An error occurred. Please try again.';
  } finally {
    isLegacyLoading.value = false;
  }
};

const handleOAuthLogin = async ({ provider }: { provider: OAUTH_PROVIDER }) => {
  try {
    isOAuthLoading.value = true;
    await loginWithOAuth({ provider, from: 'signin' });
  } catch {
    addErrorNotification(`Failed to sign in with ${provider}. Please try again.`);
  } finally {
    isOAuthLoading.value = false;
  }
};

const handlePasskeyLogin = async () => {
  try {
    isPasskeyLoading.value = true;
    await loginWithPasskey();
    navigateAfterLogin();
  } catch {
    addErrorNotification('Failed to sign in with passkey. Please try again.');
  } finally {
    isPasskeyLoading.value = false;
  }
};
</script>
