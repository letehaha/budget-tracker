<script setup lang="ts">
import { loadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { removeValuesFromObject } from '@/common/utils/remove-values-from-object';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Dialog from '@/components/lib/ui/dialog';
import TransactionRecrod from '@/components/transactions-list/transaction-record.vue';
import { cn } from '@/lib/utils';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { useInfiniteQuery } from '@tanstack/vue-query';
import { isDate } from 'date-fns';
import { isEqual } from 'lodash-es';
import { CircleAlert, ListFilterIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';

interface RecordListModalProps {
  transactionType: TRANSACTION_TYPES;
  selectedTransactions: TransactionModel[];
  onSelect: (item: TransactionModel) => void;
}

const props = defineProps<RecordListModalProps>();

const DEFAULT_FILTERS: {
  start: Date | null;
  end: Date | null;
  amountGte: number | null;
  amountLte: number | null;
} = {
  // TODO: by accounts
  // TODO: by categories
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

const limit = 15;
const fetchTransactions = ({ pageParam, filter }: { pageParam: number; filter: typeof appliedFilters.value }) => {
  const from = pageParam * limit;

  return loadTransactions(
    removeValuesFromObject<Parameters<typeof loadTransactions>[0]>({
      limit,
      from,
      transactionType: props.transactionType,
      excludeTransfer: true,
      excludeRefunds: true,
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
  queryKey: [...VUE_QUERY_CACHE_KEYS.recordsPageTransactionList, props.transactionType, appliedFilters],
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

const selectedTxsIds = computed(() => new Set(props.selectedTransactions.map((i) => i.id)));

const handlerRecordClick = (transaction: TransactionModel) => {
  props.onSelect(transaction);
};
</script>

<template>
  <div class="flex flex-col flex-grow min-h-0 gap-2">
    <div class="flex">
      <Dialog.Dialog v-model:open="isFiltersDialogOpen">
        <Dialog.DialogTrigger as-child>
          <Button variant="ghost" size="icon" class="ml-auto">
            <div class="relative">
              <ListFilterIcon />

              <template v-if="isAnyFiltersApplied">
                <div class="size-3 rounded-full bg-primary absolute -top-1 -right-1" />
              </template>
            </div>
          </Button>
        </Dialog.DialogTrigger>
        <Dialog.DialogContent class="max-w-[350px]">
          <Dialog.DialogHeader class="mb-6">
            <Dialog.DialogTitle> Select filters </Dialog.DialogTitle>
          </Dialog.DialogHeader>
          <div class="grid gap-4">
            <DateField
              v-model="filters.start"
              :calendar-options="{
                maxDate: filters.end,
              }"
              label="From date"
            />
            <DateField
              v-model="filters.end"
              :calendar-options="{
                minDate: filters.start,
              }"
              label="To date"
            />

            <div class="flex gap-2">
              <InputField v-model="filters.amountGte" label="Amount from (gte)" placeholder=">= than" />
              <InputField v-model="filters.amountLte" label="To (lte)" placeholder="<= than" />
            </div>

            <div class="flex gap-2">
              <Button
                variant="secondary"
                :disabled="isResetButtonDisabled"
                class="flex-shrink w-full"
                @click="resetFilters"
              >
                Reset
              </Button>

              <template v-if="isFiltersOutOfSync">
                <Button variant="default" class="flex-shrink w-full" @click="applyFilters"> Apply </Button>
              </template>
            </div>
          </div>
        </Dialog.DialogContent>
      </Dialog.Dialog>
    </div>

    <div class="overflow-y-auto">
      <template v-if="isFetched && transactionsPages">
        <template v-for="item in transactionsPages?.pages?.flat()" :key="item.id">
          <div :class="cn('border border-transparent rounded-xl', selectedTxsIds.has(item.id) && 'border-primary/70')">
            <TransactionRecrod :tx="item" @record-click="(payload) => handlerRecordClick(payload[0])" />
          </div>
        </template>
      </template>
    </div>

    <template v-if="hasNextPage">
      <Button variant="secondary" @click="() => fetchNextPage()"> Load more </Button>
    </template>
    <template v-else-if="!hasNextPage && transactionsPages?.pages?.flat().length">
      <p class="mt-4 text-center text-sm">No more transactions to load</p>
    </template>
    <template v-else>
      <p class="text-center text-sm text-white/80 max-w-[80%] mx-auto">
        <CircleAlert :size="48" class="m-auto mb-4" />
        <template v-if="transactionType === TRANSACTION_TYPES.income">
          There's no income transactions in the system that are not already marked as refunds. Create some to proceed
        </template>
        <template v-else-if="transactionType === TRANSACTION_TYPES.expense">
          There's no expense transactions in the system that are not already marked as refunds. Create some to proceed
        </template>
        <template v-else> There's no transactions to select. Create some to proceed </template>

        <template v-if="isAnyFiltersApplied">
          <Button class="mt-4 w-full" variant="secondary" @click="resetFilters"> Reset filters </Button>
        </template>
      </p>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.record-list {
  max-width: 420px;
  width: 100%;
  max-height: 100%;
  padding: 16px;
  background-color: var(--app-surface-color);
}
.record-list__load-more {
  background-color: transparent;
  border: none;
  cursor: pointer;

  color: var(--app-primary);

  display: block;
  margin: auto;

  font-size: 16px;

  margin-top: 32px;
}
</style>
