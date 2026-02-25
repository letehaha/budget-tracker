<script setup lang="ts">
import { loadTransactions, loadTransferRecommendations } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { removeValuesFromObject } from '@/common/utils/remove-values-from-object';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { useInfiniteQuery, useQuery } from '@tanstack/vue-query';
import { isDate } from 'date-fns';
import { isEqual } from 'lodash-es';
import { CircleAlert, ListFilterIcon, SparklesIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

interface TransferRecordsListProps {
  transactionType: TRANSACTION_TYPES;
  /** Origin transaction ID (for recommendations when editing) */
  originTransactionId?: number;
  /** Origin transaction amount for recommendations (used when creating new tx) */
  originAmount?: number | null;
  /** Origin account ID for recommendations (used when creating new tx) */
  originAccountId?: number | null;
}

const props = defineProps<TransferRecordsListProps>();

const emit = defineEmits<{
  select: [value: TransactionModel];
}>();

const { t } = useI18n();

const DEFAULT_FILTERS: {
  start: Date | null;
  end: Date | null;
  amountGte: number | null;
  amountLte: number | null;
} = {
  start: null,
  end: null,
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
  const from = pageParam * limit;

  return loadTransactions(
    removeValuesFromObject<Parameters<typeof loadTransactions>[0]>({
      limit,
      from,
      transactionType: props.transactionType,
      excludeTransfer: true,
      excludeRefunds: true, // Exclude refund-linked transactions for transfers
      endDate: isDate(filter.end) ? filter.end.toISOString() : undefined,
      startDate: isDate(filter.start) ? filter.start.toISOString() : undefined,
      amountGte: filter.amountGte,
      amountLte: filter.amountLte,
    }),
  );
};

const {
  data: transactionsPages,
  fetchNextPage,
  hasNextPage,
  isFetched,
} = useInfiniteQuery({
  queryKey: [
    ...VUE_QUERY_CACHE_KEYS.recordsPageTransactionList,
    'transfer-list',
    props.transactionType,
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

// Filter out recommendations from the main list to avoid duplicates
const filteredTransactions = computed(() => {
  const allTransactions = transactionsPages.value?.pages?.flat() ?? [];
  if (!recommendations.value?.length) return allTransactions;
  return allTransactions.filter((tx) => !recommendationIds.value.has(tx.id));
});

const handleRecordClick = (transaction: TransactionModel) => {
  emit('select', transaction);
};

const hasAnyTransactions = computed(
  () => (recommendations.value?.length ?? 0) > 0 || filteredTransactions.value.length > 0,
);
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

    <div class="overflow-y-auto">
      <!-- Recommendations section -->
      <template v-if="recommendations?.length && !isAnyFiltersApplied">
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

        <!-- Divider between recommendations and all transactions -->
        <template v-if="filteredTransactions.length">
          <div class="text-muted-foreground mb-2 text-xs font-medium">
            {{ t('dialogs.manageTransaction.transferRecordsList.allTransactionsLabel') }}
          </div>
        </template>
      </template>

      <!-- All transactions section -->
      <template v-if="isFetched && transactionsPages">
        <template v-for="item in filteredTransactions" :key="item.id">
          <TransactionRecord :tx="item" @record-click="(payload) => handleRecordClick(payload[0])" />
        </template>
      </template>
    </div>

    <template v-if="hasNextPage">
      <Button variant="secondary" @click="() => fetchNextPage()">
        {{ t('dialogs.manageTransaction.transferRecordsList.loadMoreButton') }}
      </Button>
    </template>
    <template v-else-if="!hasNextPage && hasAnyTransactions">
      <p class="mt-4 text-center text-sm">
        {{ t('dialogs.manageTransaction.transferRecordsList.noMoreTransactions') }}
      </p>
    </template>
    <template v-else>
      <p class="mx-auto max-w-[80%] text-center text-sm text-white/80">
        <CircleAlert :size="48" class="m-auto mb-4" />
        <template v-if="transactionType === TRANSACTION_TYPES.income">
          {{ t('dialogs.manageTransaction.transferRecordsList.noIncomeTransactions') }}
        </template>
        <template v-else-if="transactionType === TRANSACTION_TYPES.expense">
          {{ t('dialogs.manageTransaction.transferRecordsList.noExpenseTransactions') }}
        </template>
        <template v-else>
          {{ t('dialogs.manageTransaction.transferRecordsList.noTransactions') }}
        </template>

        <template v-if="isAnyFiltersApplied">
          <Button class="mt-4 w-full" variant="secondary" @click="resetFilters">
            {{ t('dialogs.manageTransaction.transferRecordsList.resetFiltersButton') }}
          </Button>
        </template>
      </p>
    </template>
  </div>
</template>
