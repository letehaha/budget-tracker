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

const refreshBalance = async () => {
  try {
    isLoading.value = true;
    const response = await lunchflowStore.refreshAccountBalance(props.account.id);

    addNotification({
      text: `${response.message}. New balance: ${response.balance} ${response.currency}`,
      type: NotificationType.success,
    });
  } catch {
    addNotification({
      text: 'Failed to refresh balance',
      type: NotificationType.error,
    });
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div>
    <h3 class="text-lg font-medium">Refresh Balance</h3>
    <p class="text-muted-foreground mb-4 text-sm">Update account balance from Lunch Flow.</p>

    <Button @click="refreshBalance" :disabled="isLoading || lunchflowStore.isLoading"> Refresh Balance </Button>
  </div>
</template>
