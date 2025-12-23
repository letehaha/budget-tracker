<template>
  <div class="p-4">
    <div class="flex w-min max-w-full flex-col gap-4 lg:w-auto lg:flex-row xl:gap-20">
      <template v-if="!isMobileView">
        <Card
          class="sticky top-(--header-height) h-min max-h-[calc(100vh-var(--header-height)-32px)] min-w-[350px] overflow-auto p-4"
        >
          <FiltersPanel
            v-model:filters="filters"
            :is-reset-button-disabled="isResetButtonDisabled"
            :is-filters-out-of-sync="isFiltersOutOfSync"
            @reset-filters="resetFilters"
            @apply-filters="applyFilters"
          />
        </Card>
      </template>
      <template v-else>
        <FiltersDialog v-model:open="isFiltersDialogOpen" :isAnyFiltersApplied="isAnyFiltersApplied">
          <div class="relative max-h-[calc(100vh-var(--header-height)-32px)] overflow-auto">
            <FiltersPanel
              v-model:filters="filters"
              :is-reset-button-disabled="isResetButtonDisabled"
              :is-filters-out-of-sync="isFiltersOutOfSync"
              @reset-filters="resetFilters"
              @apply-filters="applyFilters"
            />
          </div>
        </FiltersDialog>
      </template>

      <Card class="w-screen max-w-full rounded-md px-2 py-4 sm:max-w-[450px] sm:p-6">
        <template v-if="isFetched && transactionsPages">
          <TransactionsList
            ref="transactionsListRef"
            @fetch-next-page="fetchNextPage"
            :hasNextPage="hasNextPage"
            :isFetchingNextPage="isFetchingNextPage"
            :transactions="transactionsPages.pages.flat()"
          />
        </template>
      </Card>
    </div>

    <ScrollTopButton />
  </div>
</template>

<script lang="ts" setup>
import { Card } from '@/components/lib/ui/card';
import FiltersDialog from '@/components/records-filters/filters-dialog.vue';
import FiltersPanel from '@/components/records-filters/index.vue';
import { useTransactionsWithFilters } from '@/components/records-filters/transactions-with-filters';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { parseISO } from 'date-fns';
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import ScrollTopButton from './components/scroll-to-top.vue';

const {
  isResetButtonDisabled,
  isAnyFiltersApplied,
  isFiltersOutOfSync,
  resetFilters,
  applyFilters,
  filters,
  appliedFilters,
  transactionsPages,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isFetched,
  transactionsListRef,
} = useTransactionsWithFilters();

const route = useRoute();
const isFiltersDialogOpen = ref(false);

// Initialize filters from query parameters
onMounted(() => {
  const query = route.query;
  
  if (Object.keys(query).length > 0) {
    // Create initial filters from query parameters
    const initialFilters = { ...filters.value };
    
    if (query.categoryIds) {
      const categoryIds = Array.isArray(query.categoryIds) 
        ? query.categoryIds.map(id => Number(id))
        : [Number(query.categoryIds)];
      initialFilters.categoryIds = categoryIds;
    }
    
    if (query.start) {
      initialFilters.start = parseISO(query.start as string);
    }
    
    if (query.end) {
      initialFilters.end = parseISO(query.end as string);
    }
    
    if (query.transactionType) {
      initialFilters.transactionType = query.transactionType as TRANSACTION_TYPES;
    }
    
    if (query.amountGte) {
      initialFilters.amountGte = Number(query.amountGte);
    }
    
    if (query.amountLte) {
      initialFilters.amountLte = Number(query.amountLte);
    }
    
    if (query.noteIncludes) {
      initialFilters.noteIncludes = query.noteIncludes as string;
    }
    
    if (query.excludeRefunds) {
      initialFilters.excludeRefunds = query.excludeRefunds === 'true';
    }
    
    if (query.excludeTransfer) {
      initialFilters.excludeTransfer = query.excludeTransfer === 'true';
    }
    
    // Apply the initial filters
    filters.value = initialFilters;
    appliedFilters.value = initialFilters;
  }
});

watch(appliedFilters, () => {
  isFiltersDialogOpen.value = false;
});

const isMobileView = useWindowBreakpoints(1024);
</script>
