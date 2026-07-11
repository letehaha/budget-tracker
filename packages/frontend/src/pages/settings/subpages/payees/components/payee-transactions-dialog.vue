<template>
  <ResponsiveDialog v-model:open="isOpen" :dialog-content-class="cn('bg-card max-h-[90dvh] w-full max-w-3xl p-6')">
    <template #title>
      <span class="text-lg font-semibold">{{ $t('payees.transactionsDialog.title', { name: payeeName ?? '' }) }}</span>
    </template>

    <div v-if="!payeeId" class="text-muted-foreground py-8 text-center text-sm">
      {{ $t('payees.transactionsDialog.empty') }}
    </div>
    <div v-else-if="isFetching && transactions.length === 0" class="text-muted-foreground py-8 text-center text-sm">
      {{ $t('common.loading') }}
    </div>
    <div v-else-if="transactions.length === 0" class="text-muted-foreground py-8 text-center text-sm">
      {{ $t('payees.transactionsDialog.empty') }}
    </div>
    <TransactionsList v-else :transactions="transactions" :paginate="false" raw-list />
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { loadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/vue-query';
import { useVModel } from '@vueuse/core';
import { computed } from 'vue';

const PAGE_SIZE = 500;
const STALE_TIME_MS = 60_000;

const props = defineProps<{
  open: boolean;
  payeeId: string | null;
  payeeName: string | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const isOpen = useVModel(props, 'open', emit);

const { data, isFetching } = useQuery({
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.payeeTransactionsDialog, props.payeeId ?? 'none'] as const),
  queryFn: () =>
    loadTransactions({
      offset: 0,
      limit: PAGE_SIZE,
      payeeIds: [props.payeeId!],
      includeSplits: true,
      includeTags: true,
      includeGroups: true,
    }),
  enabled: computed(() => props.open && !!props.payeeId),
  staleTime: STALE_TIME_MS,
});

const transactions = computed(() => data.value ?? []);
</script>
