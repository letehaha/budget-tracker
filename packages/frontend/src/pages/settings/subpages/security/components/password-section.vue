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
        <div v-if="hasPassword" class="space-y-2">
          <label for="current-password" class="text-sm font-medium">Current Password</label>
          <input
            id="current-password"
            v-model="form.currentPassword"
            type="password"
            :disabled="isSubmitting"
            class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Enter current password"
          />
        </div>

        <!-- New password -->
        <div class="space-y-2">
          <label for="new-password" class="text-sm font-medium">{{ hasPassword ? 'New Password' : 'Password' }}</label>
          <input
            id="new-password"
            v-model="form.newPassword"
            type="password"
            :disabled="isSubmitting"
            class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Enter new password"
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
        <div class="space-y-2">
          <label for="confirm-password" class="text-sm font-medium">Confirm Password</label>
          <input
            id="confirm-password"
            v-model="form.confirmPassword"
            type="password"
            :disabled="isSubmitting"
            class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Confirm new password"
          />
          <p v-if="form.confirmPassword && form.newPassword !== form.confirmPassword" class="text-destructive text-xs">
            Passwords do not match
          </p>
        </div>

        <!-- Error message -->
        <p v-if="errorMessage" class="text-destructive text-sm">{{ errorMessage }}</p>

        <!-- Submit button -->
        <Button type="submit" :disabled="!isFormValid || isSubmitting">
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
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { authClient } from '@/lib/auth-client';
import { Loader2Icon } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';

interface Account {
  id: string;
  providerId: string;
}

const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const isLoading = ref(true);
const isSubmitting = ref(false);
const hasPassword = ref(false);
const errorMessage = ref('');

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const strengthColors: Record<number, string> = {
  0: 'bg-destructive',
  1: 'bg-destructive',
  2: 'bg-yellow-500',
  3: 'bg-green-400',
  4: 'bg-green-500',
};

const strengthTextColors: Record<number, string> = {
  0: 'text-destructive',
  1: 'text-destructive',
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
  const password = form.newPassword;
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

const isFormValid = computed(() => {
  if (!form.newPassword || form.newPassword.length < 8) return false;
  if (form.newPassword !== form.confirmPassword) return false;
  if (hasPassword.value && !form.currentPassword) return false;
  return true;
});

const loadPasswordStatus = async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (authClient as any).listAccounts();
    if (result.data) {
      hasPassword.value = result.data.some((a: Account) => a.providerId === 'credential');
    }
  } catch (e) {
    console.error('Failed to load account status:', e);
  }
};

const handleSubmit = async () => {
  if (!isFormValid.value) return;

  errorMessage.value = '';

  try {
    isSubmitting.value = true;

    if (hasPassword.value) {
      // Change password
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (authClient as any).changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });

      if (result.error) {
        errorMessage.value = result.error.message || 'Failed to change password';
        return;
      }

      addSuccessNotification('Password changed successfully');
    } else {
      // Set password (for OAuth-only accounts)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (authClient as any).setPassword({
        password: form.newPassword,
      });

      if (result.error) {
        errorMessage.value = result.error.message || 'Failed to set password';
        return;
      }

      hasPassword.value = true;
      addSuccessNotification('Password set successfully');
    }

    // Clear form
    form.currentPassword = '';
    form.newPassword = '';
    form.confirmPassword = '';
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
