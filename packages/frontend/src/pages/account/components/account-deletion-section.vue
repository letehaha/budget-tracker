<script setup lang="ts">
import { AlertDialog } from '@/components/common';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { Separator } from '@/components/lib/ui/separator';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes';
import { useAccountsStore } from '@/stores';
import { AccountModel, TransactionModel } from '@bt/shared/types';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import AccountUnlinkSection from './account-unlink-section.vue';

const props = defineProps<{
  account: AccountModel;
  transactions: TransactionModel[];
}>();
const router = useRouter();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const confirmAccountName = ref('');
const accountHasTransactions = computed(() => props.transactions.length > 0);

const deleteAccount = async () => {
  const accountName = props.account.name;

  if (confirmAccountName.value !== accountName) return;
  try {
    await accountsStore.deleteAccount({
      id: props.account.id,
    });
    addSuccessNotification(`Account ${accountName} removed successfully`);
    router.push({ name: ROUTES_NAMES.accounts });
  } catch {
    addErrorNotification('An error occured while trying to delete account');
  }
};
</script>

<template>
  <div class="border-destructive @container/danger-zone mt-4 grid gap-4 rounded-xl border p-4 sm:-mx-4">
    <p class="text-xl font-medium">Danger zone</p>

    <AccountUnlinkSection :account="account" />

    <Separator v-if="account.bankDataProviderConnectionId" />

    <div
      class="flex flex-col justify-between gap-2 @[400px]/danger-zone:flex-row @[400px]/danger-zone:items-center"
    >
      <div>
        <p class="mb-2 font-bold">Delete this account</p>
        <p class="text-xs">
          Once you delete the account, there is no going back. <br />
          <b>All the transactions will be deleted.</b>
          Please be certain.
        </p>
      </div>

      <AlertDialog
        title="Are you absolutely sure?"
        :accept-disabled="confirmAccountName !== account.name"
        accept-variant="destructive"
        @accept="deleteAccount"
      >
        <template #trigger>
          <Button variant="destructive"> Delete this account </Button>
        </template>
        <template #description>
          <template v-if="accountHasTransactions">
            This action cannot be undone.
            <strong>
              You have {{ transactions.length }} transactions associated with this account, they will also be
              deleted.
            </strong>
            Do you really want to delete this account?
          </template>
          <template v-else>
            This action cannot be undone. Do you really want to delete this account?
            <strong> You have zero transactions associated. </strong>
          </template>
        </template>
        <template #content>
          <InputField
            v-model="confirmAccountName"
            placeholder="Enter account name"
            class="border-destructive focus-visible:outline-destructive"
          />
        </template>
      </AlertDialog>
    </div>
  </div>
</template>
