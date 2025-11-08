<script setup lang="ts">
import { convertMonobankToSystem } from '@/api/accounts';
import { AlertDialog } from '@/components/common';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';

const props = defineProps<{
  account: AccountModel;
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();

const convertAccount = async () => {
  try {
    await convertMonobankToSystem({ id: props.account.id });
    await accountsStore.loadAccounts();
    addSuccessNotification('Account converted to system account successfully');
  } catch {
    addErrorNotification('An error occured while trying to convert account');
  }
};
</script>

<template>
  <div class="flex flex-col justify-between gap-2 @[400px]/danger-zone:flex-row @[400px]/danger-zone:items-center">
    <div>
      <p class="mb-2 font-bold">Convert to system account</p>
      <p class="text-xs">
        This will convert your old Monobank account to a regular system account. <br />
        After conversion, you can connect it via the new bank data providers system.
      </p>
    </div>

    <AlertDialog
      title="Convert to system account?"
      accept-text="Convert"
      accept-variant="default"
      @accept="convertAccount"
    >
      <template #trigger>
        <Button variant="outline"> Convert Account </Button>
      </template>
      <template #description>
        This will change the account type from Monobank to System. All transactions and balances will be preserved.
        You'll be able to reconnect via the new integrations system afterwards.
      </template>
    </AlertDialog>
  </div>
</template>
