<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <div>
        <p>Sync latest transactions</p>
        <p class="text-muted-foreground text-sm">Transactions are auto-synced every 12 hours</p>
      </div>

      <Button :disabled="isSyncDisabled" class="min-w-[100px]" size="sm" @click="syncTransactionsHandler">
        {{ isSyncing || isAccountSyncing ? 'Syncing...' : 'Sync' }}
      </Button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { syncTransactions } from '@/api/bank-data-providers';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { Button } from '@/components/lib/ui/button';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useSyncStatus } from '@/composable/use-sync-status';
import { API_ERROR_CODES, AccountModel } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const queryClient = useQueryClient();
const { addNotification } = useNotificationCenter();
const { accountStatuses, subscribeToSSE } = useSyncStatus();

// Check if there's an active sync for this specific account
const isAccountSyncing = computed(() => {
  const status = accountStatuses.value.find((s) => s.accountId === props.account.id);
  return status?.status === 'syncing' || status?.status === 'queued';
});

// Mutation for syncing transactions
const { mutate: syncMutate, isPending: isSyncing } = useMutation({
  mutationFn: async () => {
    if (!props.account.bankDataProviderConnectionId) {
      throw new Error('Account is not linked to a bank connection');
    }

    // Subscribe to SSE for updates
    subscribeToSSE();

    return syncTransactions(props.account.bankDataProviderConnectionId, props.account.id);
  },
  onSuccess: (response) => {
    // Check if response has jobGroupId (queue-based sync like Monobank)
    if ('jobGroupId' in response) {
      addNotification({
        text: `${response.message}. Processing ${response.totalBatches} batch(es)...`,
        type: NotificationType.info,
      });
      // SSE will provide updates as sync progresses
    } else {
      // Immediate sync (EnableBanking) - SSE will notify when complete
      addNotification({
        text: 'Sync started...',
        type: NotificationType.info,
      });

      queryClient.invalidateQueries({
        queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange],
      });
    }
  },
  onError: (error: unknown) => {
    const e = error as { data?: { code?: string; message?: string } };
    if (e?.data?.code === API_ERROR_CODES.forbidden) {
      addNotification({
        text: e.data.message || 'Access forbidden',
        type: NotificationType.error,
      });
    } else {
      console.error(error);
      addNotification({
        text: 'Failed to sync transactions',
        type: NotificationType.error,
      });
    }
  },
});

const isSyncDisabled = computed(() => isSyncing.value || isAccountSyncing.value);

const syncTransactionsHandler = () => {
  if (!props.account.bankDataProviderConnectionId) {
    addNotification({
      text: 'This account is not linked to a bank connection',
      type: NotificationType.error,
    });
    return;
  }

  syncMutate();
};
</script>
