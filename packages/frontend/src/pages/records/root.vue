<template>
  <div class="p-4">
    <div class="flex w-min max-w-full flex-col gap-4 lg:w-auto lg:flex-row xl:gap-20">
      <template v-if="!isMobileView">
        <Card class="sticky top-[var(--header-height)] h-min min-w-[350px] p-4">
          <FiltersPanel
            v-model:filters="filters"
            :applied-filters="appliedFilters"
            :is-reset-button-disabled="isResetButtonDisabled"
            :is-filters-out-of-sync="isFiltersOutOfSync"
            :is-any-filters-applied="isAnyFiltersApplied"
            @reset-filters="resetFilters"
            @apply-filters="applyFilters"
          />
        </Card>
      </template>
      <template v-else>
        <FiltersDialog v-model:open="isFiltersDialogOpen" :isAnyFiltersApplied="isAnyFiltersApplied">
          <FiltersPanel
            v-model:filters="filters"
            :applied-filters="appliedFilters"
            :is-reset-button-disabled="isResetButtonDisabled"
            :is-filters-out-of-sync="isFiltersOutOfSync"
            :is-any-filters-applied="isAnyFiltersApplied"
            @reset-filters="resetFilters"
            @apply-filters="applyFilters"
          />
        </FiltersDialog>
      </template>

      <TransactionsList
        :transactions-pages="transactionsPages"
        :is-fetched="isFetched"
        :has-next-page="hasNextPage"
        @fetch-next-page="fetchNextPage"
      />
    </div>

    <ScrollTopButton />
  </div>
</template>

<script lang="ts" setup>
import { loadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { removeValuesFromObject } from '@/common/utils/remove-values-from-object';
import { Card } from '@/components/lib/ui/card';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import { useInfiniteQuery } from '@tanstack/vue-query';
import isDate from 'date-fns/isDate';
import { isEqual } from 'lodash-es';
import { computed, ref, watch } from 'vue';

import FiltersDialog from './components/filters-dialog.vue';
import FiltersPanel from './components/filters-panel.vue';
import ScrollTopButton from './components/scroll-to-top.vue';
import TransactionsList from './components/transactions-list.vue';

const limit = 30;

const DEFAULT_FILTERS = {
  start: null,
  end: null,
  transactionType: null,
  amountGte: null,
  amountLte: null,
  excludeRefunds: false,
  excludeTransfer: false,
};

const filters = ref({ ...DEFAULT_FILTERS });
const appliedFilters = ref({ ...DEFAULT_FILTERS });

const isFiltersDialogOpen = ref(false);
const isResetButtonDisabled = computed(() => isEqual(filters.value, DEFAULT_FILTERS));
const isAnyFiltersApplied = computed(() => !isEqual(appliedFilters.value, DEFAULT_FILTERS));
const isFiltersOutOfSync = computed(() => !isEqual(filters.value, appliedFilters.value));

const resetFilters = () => {
  filters.value = { ...DEFAULT_FILTERS };
  appliedFilters.value = { ...DEFAULT_FILTERS };
};

const applyFilters = () => {
  appliedFilters.value = { ...filters.value };
};

watch(appliedFilters, () => {
  isFiltersDialogOpen.value = false;
});

const isMobileView = useWindowBreakpoints(1024);

const fetchTransactions = ({ pageParam, filter }) => {
  const from = pageParam * limit;

  return loadTransactions(
    removeValuesFromObject({
      limit,
      from,
      transactionType: filter.transactionType,
      endDate: isDate(filter.end) ? filter.end.toISOString() : undefined,
      startDate: isDate(filter.start) ? filter.start.toISOString() : undefined,
      amountGte: filter.amountGte,
      amountLte: filter.amountLte,
      excludeRefunds: filter.excludeRefunds,
      excludeTransfer: filter.excludeTransfer,
    }),
  );
};

const {
  data: transactionsPages,
  fetchNextPage,
  hasNextPage,
  isFetched,
} = useInfiniteQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.recordsPageRecordsList, appliedFilters],
  queryFn: ({ pageParam }) => fetchTransactions({ pageParam, filter: appliedFilters.value }),
  initialPageParam: 0,
  getNextPageParam: (lastPage, pages) => {
    if (lastPage.length < limit) return undefined;
    return pages.length;
  },
  staleTime: 1_000 * 60,
});
</script>
