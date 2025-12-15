<script setup lang="ts">
import { deleteUserAccount } from '@/api/user';
import { AlertDialog } from '@/components/common';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes';
import { useAuthStore, useUserStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const authStore = useAuthStore();
const { user } = storeToRefs(useUserStore());
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const confirmUsername = ref('');
const isDeleting = ref(false);

const isDeleteDisabled = computed(() => confirmUsername.value !== user.value.username || isDeleting.value);

const handleDeleteAccount = async () => {
  if (confirmUsername.value !== user.value.username) return;

  isDeleting.value = true;
  try {
    await deleteUserAccount();
    addSuccessNotification('Your account has been deleted successfully');
    authStore.logout();
    router.push({ name: ROUTES_NAMES.signIn });
  } catch {
    addErrorNotification('An error occurred while trying to delete your account');
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <div class="border-destructive mt-6 grid gap-4 rounded-xl border p-4">
    <p class="text-xl font-medium">Danger zone</p>

    <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <p class="mb-2 font-bold">Delete your account</p>
        <p class="text-sm">
          Once you delete your account, there is no going back. <br />
          <b>All your data will be permanently erased.</b>
          Please be certain.
        </p>
      </div>

      <AlertDialog
        title="Are you absolutely sure?"
        :accept-disabled="isDeleteDisabled"
        accept-variant="destructive"
        :accept-label="isDeleting ? 'Deleting...' : 'Delete my account'"
        @accept="handleDeleteAccount"
      >
        <template #trigger>
          <Button variant="destructive" class="shrink-0"> Delete my account </Button>
        </template>
        <template #description>
          <div class="text-left">
            This action cannot be undone. This will permanently delete your account and remove all your data including:
            <ul class="mt-2 list-inside list-disc text-sm">
              <li>All accounts and transactions</li>
              <li>All categories and budgets</li>
              <li>All investment portfolios</li>
              <li>All settings and preferences</li>
            </ul>
          </div>
        </template>
        <template #content>
          <p class="mt-4 mb-2 text-left text-sm">
            Please type <strong>{{ user.username }}</strong> to confirm
          </p>
          <InputField
            v-model="confirmUsername"
            placeholder="Enter your username"
            class="border-destructive focus-visible:outline-destructive"
          />
        </template>
      </AlertDialog>
    </div>
  </div>
</template>
