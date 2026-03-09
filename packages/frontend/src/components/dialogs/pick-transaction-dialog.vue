<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import RecordsFiltersDialog from '@/components/records-filters/filters-dialog.vue';
import RecordsFilters from '@/components/records-filters/index.vue';
import { useTransactionsWithFilters } from '@/components/records-filters/transactions-with-filters';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { useVirtualizedInfiniteScroll } from '@/composable/virtualized-infinite-scroll';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import { FILTER_OPERATION, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    open: boolean;
    transactionType?: TRANSACTION_TYPES;
  }>(),
  {
    transactionType: undefined,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  select: [tx: TransactionModel];
}>();

const { t } = useI18n();

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const {
  isResetButtonDisabled,
  isFiltersOutOfSync,
  resetFilters,
  applyFilters,
  appliedFilters,
  isAnyFiltersApplied,
  filters,
  transactionsPages,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useTransactionsWithFilters({
  queryEnabled: isOpen,
  staticFilters: { transferFilter: FILTER_OPERATION.exclude },
});

// Pre-set transaction type filter from prop
watch(
  () => props.open,
  (open) => {
    if (open && props.transactionType) {
      filters.value.transactionType = props.transactionType;
      appliedFilters.value.transactionType = props.transactionType;
    }
  },
);

const handleSelect = ([tx]: [TransactionModel, TransactionModel | undefined]) => {
  emit('select', tx);
  isOpen.value = false;
};

const parentRef = ref<HTMLElement | null>(null);
const flatTransactions = computed(() => transactionsPages.value?.pages?.flat() ?? []);

const { virtualRows, totalSize } = useVirtualizedInfiniteScroll({
  items: flatTransactions,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  parentRef,
  enabled: isOpen,
  getItemKey: (index) => flatTransactions.value[index]!.id,
});

const isFiltersDialogOpen = ref(false);

watch(appliedFilters, () => {
  isFiltersDialogOpen.value = false;
});

const isMobileView = useWindowBreakpoints(1024);
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen" dialogContentClass="max-w-[900px]">
    <template #title>
      <span>{{ t('dialogs.pickTransaction.title') }}</span>
    </template>

    <div class="grid max-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[max-content_minmax(0,1fr)]">
      <div class="relative min-h-0 overflow-y-auto px-1">
        <template v-if="isMobileView">
          <RecordsFiltersDialog v-model:open="isFiltersDialogOpen" :isAnyFiltersApplied="isAnyFiltersApplied">
            <div class="relative max-h-[calc(100vh-var(--header-height)-32px)] overflow-auto">
              <RecordsFilters
                v-model:filters="filters"
                :is-reset-button-disabled="isResetButtonDisabled"
                :is-filters-out-of-sync="isFiltersOutOfSync"
                @reset-filters="resetFilters"
                @apply-filters="applyFilters"
              />
            </div>
          </RecordsFiltersDialog>
        </template>
        <template v-else>
          <RecordsFilters
            v-model:filters="filters"
            :is-reset-button-disabled="isResetButtonDisabled"
            :is-filters-out-of-sync="isFiltersOutOfSync"
            @reset-filters="resetFilters"
            @apply-filters="applyFilters"
          />
        </template>
      </div>

      <div v-if="transactionsPages" ref="parentRef" class="relative max-h-[60vh] min-h-0 w-full overflow-y-auto">
        <div :style="{ height: `${totalSize}px`, position: 'relative' }">
          <div
            v-for="virtualRow in virtualRows"
            :key="String(virtualRow.key)"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }"
          >
            <TransactionRecord
              v-if="flatTransactions[virtualRow.index]"
              :tx="flatTransactions[virtualRow.index]!"
              @record-click="handleSelect"
            />
            <div v-else class="flex h-13 items-center justify-center">
              {{ t('transactions.list.loadingMore') }}
            </div>
          </div>
        </div>
        <template v-if="!hasNextPage">
          <p class="flex justify-center">{{ t('transactions.list.noMoreData') }}</p>
        </template>
      </div>
    </div>
  </ResponsiveDialog>
</template>
