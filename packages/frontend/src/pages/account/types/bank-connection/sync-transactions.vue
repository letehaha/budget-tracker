<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <div>
        <p>Sync latest transactions</p>
        <p class="text-muted-foreground text-sm">Transactions are auto-synced every 12 hours</p>
      </div>

      <Button :disabled="isSyncDisabled" class="min-w-[100px]" size="sm" @click="syncTransactionsHandler">
        {{ isSyncing || hasActiveSync ? 'Syncing...' : 'Sync' }}
      </Button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { type SyncJobResult, syncTransactions } from '@/api/bank-data-providers';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { Button } from '@/components/lib/ui/button';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useSyncJobPolling } from '@/composables/use-sync-job-polling';
import { API_ERROR_CODES, AccountModel } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';

const props = defineProps<{
  account: AccountModel;
}>();

const queryClient = useQueryClient();
const { addNotification } = useNotificationCenter();
const { startPolling, activeJobIds } = useSyncJobPolling();

// Check if there's an active sync job for this account
const hasActiveSync = computed(() => {
  // Job ID pattern: userId-accountId-timestamp
  // We can check if any active job contains this account ID
  return activeJobIds.value.some((jobId) => {
    const parts = jobId.split('-');
    // parts[1] should be accountId
    return parts[1] === String(props.account.id);
  });
});

// TODO: reflect rate-limit on the UI. Unified for all providers

// Mutation for syncing transactions
const { mutate: syncMutate, isPending: isSyncing } = useMutation({
  mutationFn: () => {
    if (!props.account.bankDataProviderConnectionId) {
      throw new Error('Account is not linked to a bank connection');
    }
    return syncTransactions(props.account.bankDataProviderConnectionId, props.account.id);
  },
  onSuccess: (response) => {
    // Check if response has jobGroupId (queue-based sync)
    if ('jobGroupId' in response) {
      const jobResult = response as SyncJobResult;
      addNotification({
        text: `${jobResult.message}. Processing ${jobResult.totalBatches} batch(es)...`,
        type: NotificationType.info,
      });

      // Start polling for progress using global composable
      if (props.account.bankDataProviderConnectionId) {
        startPolling(jobResult.jobGroupId, props.account.bankDataProviderConnectionId);
      }
    } else {
      // Old sync method - immediate success
      addNotification({
        text: 'Transactions synced successfully',
        type: NotificationType.success,
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
      // eslint-disable-next-line no-console
      console.error(error);
      addNotification({
        text: 'Failed to sync transactions',
        type: NotificationType.error,
      });
    }
  },
});

const isSyncDisabled = computed(() => isSyncing.value || hasActiveSync.value);

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
