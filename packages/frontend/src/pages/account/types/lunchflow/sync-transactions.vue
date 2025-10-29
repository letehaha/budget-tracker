<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useBanksLunchflowStore } from '@/stores/integrations/banks/lunchflow';
import { AccountModel } from '@bt/shared/types';
import { ref } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const lunchflowStore = useBanksLunchflowStore();
const { addNotification } = useNotificationCenter();
const isLoading = ref(false);

const syncTransactions = async () => {
  try {
    isLoading.value = true;
    const response = await lunchflowStore.syncTransactionsForAccount(props.account.id);

    addNotification({
      text: `${response.message}. ${response.new} new transaction(s) imported.`,
      type: NotificationType.success,
    });
  } catch {
    addNotification({
      text: 'Failed to sync transactions',
      type: NotificationType.error,
    });
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div>
    <h3 class="text-lg font-medium">Sync Transactions</h3>
    <p class="text-muted-foreground mb-4 text-sm">Import latest transactions from Lunch Flow for this account.</p>

    <Button @click="syncTransactions" :disabled="isLoading || lunchflowStore.isLoading">
      {{ isLoading ? 'Syncing...' : 'Sync Transactions' }}
    </Button>
  </div>
</template>
