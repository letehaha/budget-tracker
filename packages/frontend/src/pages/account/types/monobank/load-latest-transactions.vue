<template>
  <div class="flex items-center justify-between">
    <p>Load all latest transaction</p>
    <Button :disabled="isRefreshDisabled" class="min-w-[100px]" size="sm" @click="loadLatestTransactionsHandler">
      {{ isRefreshDisabled ? 'Loading...' : 'Load' }}
    </Button>
  </div>
</template>

<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useLocalStorage } from '@/composable';
import { AccountModel } from '@bt/shared/types';
import { computed, ref, watchEffect } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const { addErrorNotification } = useNotificationCenter();
const { addLSItem, removeLSItem, getLSItem } = useLocalStorage();

const isRefreshDisabled = ref(false);

const accountLSKey = computed(() => `monobank-${props.account.externalId}-txs-loading-end`);

const setLoadingTimer = (wait: number) => {
  isRefreshDisabled.value = true;

  addLSItem(accountLSKey.value, String(new Date().getTime() + wait));

  setTimeout(() => {
    removeLSItem(accountLSKey.value);

    isRefreshDisabled.value = false;
  }, wait);
};

const loadLatestTransactionsHandler = () => {
  addErrorNotification('Migrate this account to new bank connection flow.');
};

watchEffect(() => {
  if (props.account) {
    const curr = new Date().getTime();
    const timestamp = Number(getLSItem(accountLSKey.value)) || curr;
    if (curr < timestamp) {
      setLoadingTimer(timestamp - curr);
    }
  }
});
</script>
