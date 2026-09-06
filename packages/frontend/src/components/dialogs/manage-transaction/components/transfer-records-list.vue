<script setup lang="ts">
import { loadTransactions, loadTransferRecommendations } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import TransactionRecordSkeleton from '@/components/transactions-list/transaction-record-skeleton.vue';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { useVirtualizedInfiniteScroll } from '@/composable/virtualized-infinite-scroll';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { useInfiniteQuery, useQuery } from '@tanstack/vue-query';
import { isDate } from 'date-fns';
import { isEqual, isNil, omitBy } from 'lodash-es';
import { CircleAlert, ListFilterIcon, SparklesIcon } from '@lucide/vue';
import { useResizeObserver } from '@vueuse/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

interface TransferRecordsListProps {
  transactionType: TRANSACTION_TYPES;
  /** Origin transaction ID (for recommendations when editing) */
  originTransactionId?: string;
  /** Origin transaction amount for recommendations (used when creating new tx) */
  originAmount?: number | null;
  /** Origin account ID for recommendations (used when creating new tx) */
  originAccountId?: string | null;
}

const props = defineProps<TransferRecordsListProps>();

const emit = defineEmits<{
  select: [value: TransactionModel];
}>();

const { t } = useI18n();

const DEFAULT_FILTERS: {
  start: Date | undefined;
  end: Date | undefined;
  amountGte: number | null;
  amountLte: number | null;
} = {
  start: undefined,
  end: undefined,
  amountGte: null,
  amountLte: null,
};

const isFiltersDialogOpen = ref(false);
const filters = ref({ ...DEFAULT_FILTERS });
const appliedFilters = ref({ ...DEFAULT_FILTERS });

const isResetButtonDisabled = computed(() => isEqual(filters.value, DEFAULT_FILTERS));
const isAnyFiltersApplied = computed(() => !isEqual(appliedFilters.value, DEFAULT_FILTERS));
const isFiltersOutOfSync = computed(() => !isEqual(filters.value, appliedFilters.value));
const resetFilters = () => {
  filters.value = { ...DEFAULT_FILTERS };
  appliedFilters.value = { ...DEFAULT_FILTERS };
  isFiltersDialogOpen.value = false;
};
const applyFilters = () => {
  appliedFilters.value = { ...filters.value };
  isFiltersDialogOpen.value = false;
};

// Check if we can fetch recommendations
// Either: have transactionId (editing) OR have form data (creating)
const canFetchRecommendations = computed(() => {
  if (isAnyFiltersApplied.value) return false;

  // Option 1: Have transaction ID (editing existing transaction)
  if (props.originTransactionId) return true;

  // Option 2: Have form data (creating new transaction)
  return !!(props.originAmount && props.originAmount > 0 && props.originAccountId);
});

// Build query params for recommendations
const recommendationsQueryParams = computed(() => {
  if (props.originTransactionId) {
    return { transactionId: props.originTransactionId };
  }
  return {
    transactionType: props.transactionType,
    originAmount: props.originAmount!,
    accountId: props.originAccountId!,
  };
});

// Fetch recommendations
const { data: recommendations } = useQuery({
  queryKey: [
    ...VUE_QUERY_CACHE_KEYS.recordsPageTransactionList,
    'transfer-recommendations',
    props.originTransactionId,
    props.transactionType,
    props.originAmount,
    props.originAccountId,
  ],
  queryFn: () => loadTransferRecommendations(recommendationsQueryParams.value),
  enabled: canFetchRecommendations,
  staleTime: Infinity,
});

// Get recommendation IDs to exclude from the main list
const recommendationIds = computed(() => new Set(recommendations.value?.map((r) => r.id) ?? []));

const limit = 15;
const fetchTransactions = ({ pageParam, filter }: { pageParam: number; filter: typeof appliedFilters.value }) => {
  const offset = pageParam * limit;

  return loadTransactions(
    omitBy(
      {
        limit,
        offset,
        transactionType: props.transactionType,
        excludeTransfer: true,
        excludeRefunds: true, // Exclude refund-linked transactions for transfers
        excludeAccountIds: props.originAccountId ? [props.originAccountId] : undefined,
        to: isDate(filter.end) ? filter.end!.toISOString() : undefined,
        from: isDate(filter.start) ? filter.start!.toISOString() : undefined,
        amountGte: filter.amountGte ?? undefined,
        amountLte: filter.amountLte ?? undefined,
      },
      isNil,
    ) as Parameters<typeof loadTransactions>[0],
  );
};

const {
  data: transactionsPages,
  fetchNextPage,
  hasNextPage,
  isFetched,
  isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: [
    ...VUE_QUERY_CACHE_KEYS.recordsPageTransactionList,
    'transfer-list',
    props.transactionType,
    props.originAccountId,
    appliedFilters,
  ],
  queryFn: ({ pageParam }) => fetchTransactions({ pageParam, filter: appliedFilters.value }),
  initialPageParam: 0,
  getNextPageParam: (lastPage, pages) => {
    // No more pages to load
    if (lastPage.length < limit) return undefined;
    // returns the number of pages fetched so far as the next page param
    return pages.length;
  },
  staleTime: Infinity,
});

const showRecommendations = computed(() => Boolean(recommendations.value?.length) && !isAnyFiltersApplied.value);

// Recommendations are excluded from the main list only while their own section renders them.
const filteredTransactions = computed(() => {
  const allTransactions = transactionsPages.value?.pages?.flat() ?? [];
  if (!showRecommendations.value) return allTransactions;
  return allTransactions.filter((tx) => !recommendationIds.value.has(tx.id));
});

const handleRecordClick = (transaction: TransactionModel) => {
  emit('select', transaction);
};

const hasAnyTransactions = computed(
  () => (recommendations.value?.length ?? 0) > 0 || filteredTransactions.value.length > 0,
);

// 44px record (two text lines + py-1) + 8px gap
const TRANSACTION_ROW_HEIGHT = 52;

const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);
const parentRef = computed<HTMLElement | null>(() => scrollAreaRef.value?.viewportRef?.viewportElement ?? null);

// The recommendations block scrolls with the list, so the virtualizer needs the
// distance it pushes the rows down to map scroll position onto them.
const scrollContentRef = ref<HTMLElement | null>(null);
const listContainerRef = ref<HTMLElement | null>(null);
const scrollMargin = ref(0);
useResizeObserver(scrollContentRef, () => {
  const listEl = listContainerRef.value;
  const scrollEl = parentRef.value;
  if (!listEl || !scrollEl) return;
  scrollMargin.value = listEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
});

const { virtualRows, totalSize } = useVirtualizedInfiniteScroll({
  items: filteredTransactions,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  parentRef,
  scrollMargin,
  estimateSize: () => TRANSACTION_ROW_HEIGHT,
  getItemKey: (index) => filteredTransactions.value[index]!.id,
});
</script>

<template>
  <div class="flex min-h-0 grow flex-col gap-2">
    <div class="flex">
      <ResponsiveDialog v-model:open="isFiltersDialogOpen" dialog-content-class="max-w-[350px]">
        <template #trigger>
          <Button variant="ghost" size="icon" class="ml-auto">
            <div class="relative">
              <ListFilterIcon />

              <template v-if="isAnyFiltersApplied">
                <div class="bg-primary absolute -top-1 -right-1 size-3 rounded-full" />
              </template>
            </div>
          </Button>
        </template>

        <template #title>{{ t('dialogs.manageTransaction.transferRecordsList.filtersDialogTitle') }}</template>

        <div class="grid gap-4">
          <DateField
            v-model="filters.start"
            :calendar-options="{
              maxDate: filters.end,
            }"
            :label="t('dialogs.manageTransaction.transferRecordsList.fromDateLabel')"
          />
          <DateField
            v-model="filters.end"
            :calendar-options="{
              minDate: filters.start,
            }"
            :label="t('dialogs.manageTransaction.transferRecordsList.toDateLabel')"
          />

          <div class="flex gap-2">
            <InputField
              v-model="filters.amountGte"
              :label="t('dialogs.manageTransaction.transferRecordsList.amountFromLabel')"
              :placeholder="t('dialogs.manageTransaction.transferRecordsList.amountFromPlaceholder')"
            />
            <InputField
              v-model="filters.amountLte"
              :label="t('dialogs.manageTransaction.transferRecordsList.amountToLabel')"
              :placeholder="t('dialogs.manageTransaction.transferRecordsList.amountToPlaceholder')"
            />
          </div>

          <div class="flex gap-2">
            <Button variant="secondary" :disabled="isResetButtonDisabled" class="w-full shrink" @click="resetFilters">
              {{ t('dialogs.manageTransaction.transferRecordsList.resetButton') }}
            </Button>

            <template v-if="isFiltersOutOfSync">
              <Button variant="default" class="w-full shrink" @click="applyFilters">
                {{ t('dialogs.manageTransaction.transferRecordsList.applyButton') }}
              </Button>
            </template>
          </div>
        </div>
      </ResponsiveDialog>
    </div>

    <ScrollArea ref="scrollAreaRef" class="min-h-0 flex-1" viewport-class="h-full">
      <div ref="scrollContentRef">
        <template v-if="showRecommendations">
          <div class="mb-3">
            <div class="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
              <SparklesIcon class="size-3.5" />
              <span>{{ t('dialogs.manageTransaction.transferRecordsList.recommendedLabel') }}</span>
            </div>
            <div class="space-y-1">
              <template v-for="item in recommendations" :key="item.id">
                <TransactionRecord :tx="item" @record-click="(payload) => handleRecordClick(payload[0])" />
              </template>
            </div>
          </div>

          <template v-if="filteredTransactions.length">
            <div class="text-muted-foreground mb-2 text-xs font-medium">
              {{ t('dialogs.manageTransaction.transferRecordsList.allTransactionsLabel') }}
            </div>
          </template>
        </template>

        <div
          v-if="isFetched && transactionsPages"
          ref="listContainerRef"
          :style="{ height: `${totalSize}px`, position: 'relative' }"
        >
          <div
            v-for="virtualRow in virtualRows"
            :key="String(virtualRow.key)"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }"
          >
            <TransactionRecord
              v-if="filteredTransactions[virtualRow.index]"
              :tx="filteredTransactions[virtualRow.index]!"
              @record-click="(payload) => handleRecordClick(payload[0])"
            />
            <TransactionRecordSkeleton v-else />
          </div>
        </div>
        <div v-else class="space-y-2">
          <TransactionRecordSkeleton v-for="i in 6" :key="i" />
        </div>

        <template v-if="isFetched && !hasNextPage && hasAnyTransactions">
          <p class="mt-4 text-center text-sm">
            {{ t('dialogs.manageTransaction.transferRecordsList.noMoreTransactions') }}
          </p>
        </template>
        <template v-else-if="isFetched && !hasNextPage">
          <div
            class="text-muted-foreground flex min-h-[min(20rem,50dvh)] flex-col items-center justify-center gap-4 px-6 text-center text-sm"
          >
            <CircleAlert :size="48" />
            <p>
              <template v-if="transactionType === TRANSACTION_TYPES.income">
                {{ t('dialogs.manageTransaction.transferRecordsList.noIncomeTransactions') }}
              </template>
              <template v-else-if="transactionType === TRANSACTION_TYPES.expense">
                {{ t('dialogs.manageTransaction.transferRecordsList.noExpenseTransactions') }}
              </template>
              <template v-else>
                {{ t('dialogs.manageTransaction.transferRecordsList.noTransactions') }}
              </template>
            </p>

            <template v-if="isAnyFiltersApplied">
              <Button class="w-auto" variant="secondary" @click="resetFilters">
                {{ t('dialogs.manageTransaction.transferRecordsList.resetFiltersButton') }}
              </Button>
            </template>
          </div>
        </template>
      </div>
    </ScrollArea>
  </div>
</template>
