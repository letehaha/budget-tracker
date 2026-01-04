<template>
  <div class="space-y-6">
    <div>
      <h3 class="mb-1 text-lg font-medium">Password</h3>
      <p class="text-muted-foreground text-sm">
        {{ hasPassword ? 'Change your password' : 'Set up a password for your account' }}
      </p>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <Loader2Icon class="text-muted-foreground size-6 animate-spin" />
    </div>

    <template v-else>
      <!-- Password form -->
      <form class="max-w-md space-y-4" @submit.prevent="handleSubmit">
        <!-- Current password (only when changing) -->
        <InputField
          v-if="hasPassword"
          v-model="form.currentPassword"
          label="Current Password"
          type="password"
          :disabled="isSubmitting"
          placeholder="Enter current password"
          :error-message="getFieldErrorMessage('form.currentPassword')"
        />

        <!-- New password -->
        <div class="space-y-2">
          <InputField
            v-model="form.newPassword"
            :label="hasPassword ? 'New Password' : 'Password'"
            type="password"
            :disabled="isSubmitting"
            placeholder="Enter new password"
            :error-message="getFieldErrorMessage('form.newPassword')"
          />
          <!-- Password strength indicator -->
          <div v-if="form.newPassword" class="space-y-1">
            <div class="flex gap-1">
              <div
                v-for="i in 4"
                :key="i"
                :class="[
                  'h-1 flex-1 rounded-full',
                  i <= passwordStrength ? strengthColors[passwordStrength] : 'bg-muted',
                ]"
              />
            </div>
            <p :class="['text-xs', strengthTextColors[passwordStrength]]">
              {{ strengthLabels[passwordStrength] }}
            </p>
          </div>
        </div>

        <!-- Confirm password -->
        <InputField
          v-model="form.confirmPassword"
          label="Confirm Password"
          type="password"
          :disabled="isSubmitting"
          placeholder="Confirm new password"
          :error-message="getFieldErrorMessage('form.confirmPassword')"
        />

        <!-- Error message -->
        <p v-if="errorMessage" class="text-destructive-text text-sm">{{ errorMessage }}</p>

        <!-- Submit button -->
        <Button type="submit" :disabled="isSubmitting">
          <Loader2Icon v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
          {{ hasPassword ? 'Change Password' : 'Set Password' }}
        </Button>
      </form>

      <!-- Info text -->
      <div class="border-t pt-4">
        <h4 class="mb-2 text-sm font-medium">Password requirements</h4>
        <ul class="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          <li>Minimum 8 characters</li>
          <li>Mix of uppercase and lowercase letters recommended</li>
          <li>Include numbers and special characters for stronger security</li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormValidation } from '@/composable';
import { minLength, required, sameAs } from '@/js/helpers/validators';
import { authClient, setPassword } from '@/lib/auth-client';
import { Loader2Icon } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

interface Account {
  id: string;
  providerId: string;
}

const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const isLoading = ref(true);
const isSubmitting = ref(false);
const hasPassword = ref(false);
const errorMessage = ref('');

const form = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const { isFormValid, getFieldErrorMessage, resetValidation } = useFormValidation(
  { form },
  {
    form: {
      currentPassword: { required },
      newPassword: {
        required,
        minLength: minLength(8),
      },
      confirmPassword: {
        required,
        sameAsPassword: sameAs(computed(() => form.value.newPassword)),
      },
    },
  },
  undefined,
  {
    customValidationMessages: {
      minLength: 'Password must be at least 8 characters',
      sameAsPassword: 'Passwords do not match',
    },
  },
);

const strengthColors: Record<number, string> = {
  0: 'bg-destructive',
  1: 'bg-destructive',
  2: 'bg-yellow-500',
  3: 'bg-green-400',
  4: 'bg-green-500',
};

const strengthTextColors: Record<number, string> = {
  0: 'text-destructive-text',
  1: 'text-destructive-text',
  2: 'text-yellow-600',
  3: 'text-green-600',
  4: 'text-green-600',
};

const strengthLabels: Record<number, string> = {
  0: 'Very weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Very strong',
};

const passwordStrength = computed(() => {
  const password = form.value.newPassword;
  if (!password) return 0;

  let score = 0;

  // Length
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // Character types
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  return Math.min(score, 4);
});

const loadPasswordStatus = async () => {
  try {
    const result = await authClient.listAccounts();
    if (result.data) {
      hasPassword.value = result.data.some((a: Account) => a.providerId === 'credential');
    }
  } catch (e) {
    console.error('Failed to load account status:', e);
  }
};

const handleSubmit = async () => {
  // Skip current password validation for OAuth-only users
  if (!isFormValid(hasPassword.value ? 'form' : 'form.newPassword') || !isFormValid('form.confirmPassword')) {
    return;
  }

  errorMessage.value = '';

  try {
    isSubmitting.value = true;

    if (hasPassword.value) {
      // Change password
      const result = await authClient.changePassword({
        currentPassword: form.value.currentPassword,
        newPassword: form.value.newPassword,
      });

      if (result.error) {
        errorMessage.value = result.error.message || 'Failed to change password';
        return;
      }

      addSuccessNotification('Password changed successfully');
    } else {
      // Set password for OAuth-only accounts
      const result = await setPassword({ newPassword: form.value.newPassword });

      if (result.error) {
        errorMessage.value = result.error.message || 'Failed to set password';
        return;
      }

      hasPassword.value = true;
      addSuccessNotification('Password set successfully');
    }

    // Clear form and reset validation
    form.value.currentPassword = '';
    form.value.newPassword = '';
    form.value.confirmPassword = '';
    resetValidation();
  } catch {
    errorMessage.value = 'An unexpected error occurred';
    addErrorNotification('Failed to update password');
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(async () => {
  isLoading.value = true;
  await loadPasswordStatus();
  isLoading.value = false;
});
</script>
