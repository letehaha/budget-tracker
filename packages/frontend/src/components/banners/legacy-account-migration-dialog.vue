<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="grid gap-4 sm:max-w-md" custom-close @interact-outside.prevent @escape-key-down.prevent>
      <!-- Email verification sent state -->
      <template v-if="verificationSent">
        <DialogHeader>
          <div class="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <MailIcon class="text-primary h-8 w-8" />
          </div>
          <DialogTitle class="text-center">Check your email</DialogTitle>
          <DialogDescription class="text-center">
            We've sent a verification link to
            <span class="text-foreground font-medium">{{ form.email }}</span
            >. Please click the link to confirm your new email address.
          </DialogDescription>
        </DialogHeader>

        <div class="bg-muted/50 text-muted-foreground rounded-lg p-4 text-center text-sm">
          <p>After verification, you'll need to log in again with your new email.</p>
        </div>

        <DialogFooter class="flex-col gap-2 sm:flex-col">
          <Button variant="outline" :disabled="isSigningOut" class="w-full" @click="handleSignOut">
            {{ isSigningOut ? 'Signing out...' : 'Sign Out & Log in with new email' }}
          </Button>
        </DialogFooter>
      </template>

      <!-- Initial form state -->
      <template v-else>
        <DialogHeader>
          <DialogTitle>Update your login method</DialogTitle>
          <DialogDescription>
            Your account uses a legacy username-based login. Please add an email address to continue using your account.
          </DialogDescription>
        </DialogHeader>

        <!-- Warning -->
        <div class="bg-destructive/10 border-destructive/20 text-destructive-text rounded-md border p-3 text-sm">
          <p class="font-medium">Action required</p>
          <p class="mt-1 opacity-90">
            Without updating your login method, your account data may become corrupted or inaccessible in future
            updates.
          </p>
        </div>

        <!-- Reassurance -->
        <div class="text-muted-foreground bg-muted/50 rounded-md p-3 text-sm">
          <p>Your email will only be used for login purposes and won't be shared or used for marketing.</p>
        </div>

        <!-- Username login warning -->
        <div class="text-muted-foreground bg-muted/50 rounded-md p-3 text-sm">
          <p>
            After migration, you will no longer be able to log in with your username. Use your email instead, or connect
            OAuth accounts (Google) for easier access.
          </p>
        </div>

        <form-wrapper :error="formError" class="grid gap-4 py-4" @submit.prevent="submit">
          <input-field
            v-model="form.email"
            label="Email Address"
            type="email"
            placeholder="your@email.com"
            :disabled="isLoading"
            :error-message="getFieldErrorMessage('form.email')"
          />
        </form-wrapper>

        <DialogFooter class="flex-col gap-2 sm:flex-col">
          <Button type="submit" :disabled="isLoading || isSigningOut" class="w-full" @click="submit">
            {{ isLoading ? 'Sending verification...' : 'Send Verification Email' }}
          </Button>
          <Button type="button" variant="outline" :disabled="isLoading || isSigningOut" @click="handleSignOut">
            {{ isSigningOut ? 'Signing out...' : 'Sign Out' }}
          </Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { api } from '@/api';
import { InputField } from '@/components/fields';
import FormWrapper from '@/components/fields/form-wrapper.vue';
import { Button } from '@/components/lib/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/lib/ui/dialog';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormValidation } from '@/composable';
import { ApiErrorResponseError } from '@/js/errors';
import { email, required } from '@/js/helpers/validators';
import { getSession } from '@/lib/auth-client';
import { useAuthStore } from '@/stores';
import { MailIcon } from 'lucide-vue-next';
import { Ref, onMounted, reactive, ref } from 'vue';

const LEGACY_EMAIL_SUFFIX = '@app.migrated';

const { addErrorNotification } = useNotificationCenter();
const authStore = useAuthStore();

const isOpen = ref(false);
const isLoading = ref(false);
const isSigningOut = ref(false);
const verificationSent = ref(false);
const formError: Ref<string | null> = ref(null);

const form = reactive({
  email: '',
});

const { isFormValid, getFieldErrorMessage } = useFormValidation(
  { form },
  {
    form: {
      email: { required, email },
    },
  },
  undefined,
  {
    customValidationMessages: {
      email: 'Please enter a valid email address.',
    },
  },
);

const submit = async () => {
  if (!isFormValid()) return;

  try {
    isLoading.value = true;
    formError.value = null;

    // Use custom migration endpoint that sends verification to the new email
    await api.post('/user/migrate-legacy-email', { newEmail: form.email });

    // Show "check your email" state
    verificationSent.value = true;
  } catch (e) {
    if (e instanceof ApiErrorResponseError) {
      formError.value = e.data.message || 'Failed to send verification email';
      return;
    }
    addErrorNotification('Failed to send verification email. Please try again.');
  } finally {
    isLoading.value = false;
  }
};

const handleSignOut = async () => {
  try {
    isSigningOut.value = true;
    await authStore.logout();
    // Router will redirect to login page via guards
  } catch {
    addErrorNotification('Failed to sign out. Please try again.');
  } finally {
    isSigningOut.value = false;
  }
};

const checkIfLegacyUser = async () => {
  try {
    const session = await getSession();
    const userEmail = session?.data?.user?.email;

    // Check if this is a legacy user (email ends with @app.migrated)
    if (userEmail && userEmail.endsWith(LEGACY_EMAIL_SUFFIX)) {
      isOpen.value = true;
    }
  } catch {
    // Silently fail - don't block the user
    console.error('Failed to check legacy user status');
  }
};

onMounted(() => {
  checkIfLegacyUser();
});
</script>
