<script setup lang="ts">
import { AlertDialog } from '@/components/common';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { computed, ref } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const confirmAccountName = ref('');
const isAccountUnlinking = ref(false);

const isAccountLinkedToBank = computed(() => !!props.account.bankDataProviderConnectionId);

const unlinkAccount = async () => {
  const accountName = props.account.name;

  if (confirmAccountName.value !== accountName) return;

  isAccountUnlinking.value = true;

  try {
    await accountsStore.unlinkAccountFromBankConnection({
      id: props.account.id,
    });
    addSuccessNotification(`Account ${accountName} unlinked successfully`);
    confirmAccountName.value = '';
  } catch {
    addErrorNotification('An error occured while trying to unlink account');
    isAccountUnlinking.value = false;
  }
};
</script>

<template>
  <div
    v-if="isAccountLinkedToBank"
    class="flex flex-col justify-between gap-2 @[400px]/danger-zone:flex-row @[400px]/danger-zone:items-center"
  >
    <div>
      <p class="mb-2 font-bold">Unlink account from bank connection</p>
      <p class="text-xs">
        This will convert the account to a system account and preserve all transaction data.
        <br />
        <b>The account will no longer sync automatically.</b>
        Only manual updates will work.
        <br />
        <b class="text-green-600">Note:</b> You can reconnect this account to a bank connection later from the Settings
        tab. After reconnection syncing will start from the latest transaction date.
      </p>
    </div>

    <AlertDialog
      title="Are you sure you want to unlink?"
      :accept-disabled="confirmAccountName !== account.name"
      accept-variant="destructive"
      @accept="unlinkAccount"
    >
      <template #trigger>
        <Button variant="outline" :disable="isAccountUnlinking">
          <template v-if="isAccountUnlinking"> Unlinking... </template>
          <template v-else> Unlink from bank </template>
        </Button>
      </template>
      <template #description>
        <p class="mb-2">
          This action will disconnect your account from its bank connection and convert it to a system account.
        </p>
        <p class="mb-2">
          <strong>What will happen:</strong>
        </p>
        <ul class="mb-3 ml-4 list-disc text-sm">
          <li>Account will become a "system" type (manual updates only)</li>
          <li>All existing transactions will be preserved</li>
          <li>Automatic syncing will stop</li>
          <li>Connection history will be saved for potential future reconnection</li>
        </ul>
        <p class="text-sm text-green-600">
          <strong>Note:</strong> You can reconnect this account to a bank connection later from the Settings tab. After
          reconnection syncing will start from the latest transaction date.
        </p>
      </template>
      <template #content>
        <p class="mb-2 text-sm">Type the account name to confirm:</p>
        <InputField
          v-model="confirmAccountName"
          placeholder="Enter account name"
          class="border-destructive focus-visible:outline-destructive"
        />
      </template>
    </AlertDialog>
  </div>
</template>
