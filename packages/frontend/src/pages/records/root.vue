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
import { ref, watch } from 'vue';

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

const isFiltersDialogOpen = ref(false);

watch(appliedFilters, () => {
  isFiltersDialogOpen.value = false;
});

const isMobileView = useWindowBreakpoints(1024);
</script>
