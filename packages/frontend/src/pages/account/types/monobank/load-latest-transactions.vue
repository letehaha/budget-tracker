<template>
  <div class="flex items-center justify-between">
    <p>Load all latest transaction</p>
    <Button :disabled="isRefreshDisabled" class="min-w-[100px]" size="sm" @click="loadLatestTransactionsHandler">
      {{ isRefreshDisabled ? 'Loading...' : 'Load' }}
    </Button>
  </div>
</template>

<script lang="ts" setup>
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { Button } from '@/components/lib/ui/button';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useLocalStorage } from '@/composable';
import { useBanksMonobankStore } from '@/stores';
import { API_ERROR_CODES, AccountModel } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watchEffect } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const queryClient = useQueryClient();
const { addNotification } = useNotificationCenter();
const { addLSItem, removeLSItem, getLSItem } = useLocalStorage();
const monobankStore = useBanksMonobankStore();

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

const loadLatestTransactionsHandler = async () => {
  try {
    const response = await monobankStore.loadTransactionsFromLatest({
      accountId: props.account.id,
    });

    if (!response) {
      addNotification({
        text: "You don't have any transactions loaded yet, so we cannot load latest.",
        type: NotificationType.warning,
      });

      return;
    }

    const isUserNeedToWait = response.minutesToFinish >= 1;

    if (isUserNeedToWait) {
      setLoadingTimer(response.minutesToFinish * 60 * 1000);
    }

    addNotification({
      text: isUserNeedToWait
        ? `Loading started. Estimated loading time is ${response.minutesToFinish} minute(s).`
        : 'Loaded successfully',
      type: NotificationType.success,
    });

    if (!isUserNeedToWait) {
      queryClient.invalidateQueries({
        queryKey: [...VUE_QUERY_CACHE_KEYS.accountSpecificTransactions, props.account.id],
      });
    }
  } catch (e) {
    if (e?.data?.code === API_ERROR_CODES.forbidden) {
      addNotification({
        text: e.data.message,
        type: NotificationType.error,
      });
    } else {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }
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
