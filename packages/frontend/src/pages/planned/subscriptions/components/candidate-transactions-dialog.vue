<script setup lang="ts">
import { loadTransactionsByIds } from '@/api/transactions';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

const props = defineProps<{
  open: boolean;
  transactionIds: number[];
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { data: rawTransactions, isLoading } = useQuery({
  queryFn: () => loadTransactionsByIds({ ids: props.transactionIds }),
  queryKey: computed(() => ['candidate-sample-transactions', ...props.transactionIds]),
  enabled: computed(() => props.open && props.transactionIds.length > 0),
  staleTime: 5 * 60 * 1000,
});

const transactions = computed(() => {
  if (!rawTransactions.value) return [];
  return [...rawTransactions.value].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
});
</script>

<template>
  <ResponsiveDialog :open="open" dialog-content-class="max-w-md" @update:open="emit('update:open', $event)">
    <template #title>{{ $t('planned.subscriptions.candidates.sampleTransactionsTitle') }}</template>
    <template #description>
      {{ $t('planned.subscriptions.candidates.sampleTransactionsDescription') }}
    </template>

    <div class="min-h-30">
      <!-- Loading skeleton -->
      <div v-if="isLoading" class="space-y-2">
        <div v-for="i in transactionIds.length" :key="i" class="animate-pulse rounded-md px-2 py-1">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <div class="bg-muted size-8 shrink-0 rounded-full" />
              <div class="space-y-1.5">
                <div class="bg-muted h-4 w-24 rounded" />
                <div class="bg-muted h-3 w-16 rounded" />
              </div>
            </div>
            <div class="space-y-1.5 text-right">
              <div class="bg-muted ml-auto h-4 w-16 rounded" />
              <div class="bg-muted ml-auto h-3 w-14 rounded" />
            </div>
          </div>
        </div>
      </div>

      <!-- Transactions list -->
      <div v-else-if="transactions?.length" class="space-y-1">
        <TransactionRecord
          v-for="tx in transactions"
          :key="tx.id"
          :tx="tx"
          :as-button="false"
          @record-click="() => {}"
        />
      </div>

      <!-- Empty state -->
      <div v-else class="flex items-center justify-center py-8">
        <p class="text-muted-foreground text-sm">
          {{ $t('planned.subscriptions.candidates.noTransactionsFound') }}
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <Button variant="outline" @click="emit('update:open', false)">
          {{ $t('planned.subscriptions.candidates.close') }}
        </Button>
      </div>
    </template>
  </ResponsiveDialog>
</template>
