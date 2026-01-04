<template>
  <div class="flex h-dvh items-center justify-center px-6">
    <Card class="w-full max-w-112.5" as="form" @submit.prevent="submit">
      <CardHeader>
        <h1 class="text-center text-2xl font-semibold tracking-tight">Create an account</h1>
      </CardHeader>
      <CardContent class="grid gap-5">
        <!-- OAuth buttons -->
        <div class="grid gap-3">
          <OAuthButton :provider="OAUTH_PROVIDER.google" mode="signup" :is-loading="isOAuthLoading" @click="handleOAuthSignup({ provider: OAUTH_PROVIDER.google })">
            <template #icon>
              <GoogleIcon />
            </template>
          </OAuthButton>
          <OAuthButton :provider="OAUTH_PROVIDER.github" mode="signup" :is-loading="isOAuthLoading" @click="handleOAuthSignup({ provider: OAUTH_PROVIDER.github })">
            <template #icon>
              <GithubIcon />
            </template>
          </OAuthButton>
        </div>

        <AuthDivider text="Or continue with email" />

        <!-- Email credentials form -->
        <form-wrapper :error="formError" class="grid gap-5">
          <input-field
            v-model="form.email"
            label="Email"
            type="email"
            placeholder="your@email.com"
            :disabled="isFormLoading"
            :error-message="getFieldErrorMessage('form.email')"
          />
          <input-field
            v-model="form.name"
            label="Display Name"
            placeholder="ie. John Snow"
            :disabled="isFormLoading"
            :error-message="getFieldErrorMessage('form.name')"
          />
          <input-field
            v-model="form.password"
            label="Password"
            type="password"
            placeholder="Your password"
            :disabled="isFormLoading"
            :error-message="getFieldErrorMessage('form.password')"
          />
          <input-field
            v-model="form.verifyPassword"
            label="Verify Password"
            type="password"
            placeholder="Verify password"
            :disabled="isFormLoading"
            :error-message="getFieldErrorMessage('form.verifyPassword')"
          />
        </form-wrapper>

        <div class="flex justify-center">
          <Button type="submit" :disabled="isFormLoading" class="w-full">
            {{ isFormLoading ? 'Loading...' : 'Sign up' }}
          </Button>
        </div>
      </CardContent>

      <CardFooter class="text-center text-sm">
        Already have an account?

        <router-link :to="{ name: ROUTES_NAMES.signIn }">
          <Button as="span" variant="link"> Sign in </Button>
        </router-link>
      </CardFooter>
    </Card>
  </div>
</template>

<script lang="ts" setup>
import { AuthDivider, GithubIcon, GoogleIcon, OAuthButton } from '@/components/auth';
import { InputField } from '@/components/fields';
import FormWrapper from '@/components/fields/form-wrapper.vue';
import { Button } from '@/components/lib/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/lib/ui/card';
import { useFormValidation } from '@/composable';
import { ApiErrorResponseError } from '@/js/errors';
import { email, minLength, required, sameAs } from '@/js/helpers/validators';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAuthStore } from '@/stores';
import { API_ERROR_CODES, OAUTH_PROVIDER } from '@bt/shared/types';
import { useMutation } from '@tanstack/vue-query';
import { Ref, computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isOAuthLoading = ref(false);
const formError: Ref<string | null> = ref(null);

// Map better-auth error codes to user-friendly messages
const BETTER_AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: 'Please enter a valid email address.',
  PASSWORD_TOO_SHORT: 'Password is too short.',
  PASSWORD_TOO_LONG: 'Password is too long.',
  INVALID_PASSWORD: 'Invalid password.',
};
const form = reactive({
  email: '',
  name: '',
  password: '',
  verifyPassword: '',
});

// Check for OAuth error from callback redirect
const oauthError = route.query.oauth_error as string | undefined;
if (oauthError) {
  formError.value = oauthError;
  // Clean up the URL without triggering a navigation
  router.replace({ name: ROUTES_NAMES.signUp });
}

const { isFormValid, getFieldErrorMessage } = useFormValidation(
  { form },
  {
    form: {
      email: { required, email },
      name: { required },
      password: {
        required,
        passwordMinLength: minLength(6),
      },
      verifyPassword: {
        required,
        passwordMinLength: minLength(6),
        sameAs: sameAs(computed(() => form.password)),
      },
    },
  },
  undefined,
  {
    customValidationMessages: {
      passwordMinLength: 'Minimal length is 6.',
      sameAs: "Passwords don't match",
      email: 'Please enter a valid email address.',
    },
  },
);

const { mutate: registerUser, isPending: isFormLoading } = useMutation({
  mutationFn: ({ email: userEmail, password, name }: { email: string; password: string; name: string }) =>
    authStore.signup({ email: userEmail, password, name }),
  onSuccess: () => {
    // Store email in sessionStorage (not URL) to prevent manipulation
    sessionStorage.setItem('verify_email_address', form.email);
    router.push({ name: ROUTES_NAMES.verifyEmail });
  },
  onError: (error) => {
    // Check for our custom API errors
    if (error instanceof ApiErrorResponseError) {
      if (error.data.code === API_ERROR_CODES.userExists) {
        formError.value = 'User with that email already exists.';
        return;
      }
    }

    // Check for better-auth error codes in the message
    for (const [code, message] of Object.entries(BETTER_AUTH_ERROR_MESSAGES)) {
      if (error.message?.includes(code)) {
        formError.value = message;
        return;
      }
    }

    // Fall back to actual error message
    formError.value = error.message || 'An error occurred. Please try again.';
  },
});

const submit = () => {
  if (!isFormValid()) return;

  const { email: userEmail, name, password } = form;
  registerUser({ email: userEmail, name, password });
};

const handleOAuthSignup = async ({ provider }: { provider: OAUTH_PROVIDER }) => {
  try {
    isOAuthLoading.value = true;
    await authStore.loginWithOAuth({ provider, from: 'signup' });
  } catch {
    formError.value = `Failed to sign up with ${provider}. Please try again.`;
  } finally {
    isOAuthLoading.value = false;
  }
};
</script>
