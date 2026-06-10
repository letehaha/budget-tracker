<template>
  <PageWrapper>
    <div ref="pageContentRef" class="flex h-[calc(100dvh-var(--header-height)-32px)] min-h-0 flex-col gap-4">
      <!-- Narrow layout: filters move behind a dialog button and the user can
           switch between the compact list and the full table -->
      <template v-if="isMobileMode">
        <div class="flex shrink-0 items-center justify-between gap-2">
          <div class="bg-card flex items-center gap-0.5 rounded-md border p-0.5">
            <DesktopOnlyTooltip :content="$t('transactions.table.viewToggle.list')">
              <Button
                :variant="mobileView === 'list' ? 'secondary' : 'ghost'"
                size="icon-sm"
                :aria-label="$t('transactions.table.viewToggle.list')"
                @click="setMobileView('list')"
              >
                <ListIcon class="size-4" />
              </Button>
            </DesktopOnlyTooltip>
            <DesktopOnlyTooltip :content="$t('transactions.table.viewToggle.table')">
              <Button
                :variant="mobileView === 'table' ? 'secondary' : 'ghost'"
                size="icon-sm"
                :aria-label="$t('transactions.table.viewToggle.table')"
                @click="setMobileView('table')"
              >
                <Table2Icon class="size-4" />
              </Button>
            </DesktopOnlyTooltip>
          </div>

          <!-- Scrolling is handled by ResponsiveDialog's internal scroll wrapper –
               an extra scroll container here would clip the panel instead -->
          <FiltersDialog v-model:open="isFiltersDialogOpen" :is-any-filters-applied="isAnyFiltersApplied">
            <!-- Filters auto-apply (debounced), so the panel's Apply button is
                 permanently suppressed via is-filters-out-of-sync=false -->
            <FiltersPanel
              v-model:filters="filters"
              :is-reset-button-disabled="isResetButtonDisabled"
              :is-filters-out-of-sync="false"
              @reset-filters="resetFilters"
            />
          </FiltersDialog>
        </div>

        <Card v-if="mobileView === 'list'" class="min-h-0 flex-1 overflow-hidden">
          <ScrollArea class="h-full" :scroll-area-id="SCROLL_AREA_IDS.transactionsPage">
            <!-- No top padding: the list's bulk toolbar is sticky top-0 and must sit flush
                 with the scroll viewport edge, otherwise rows peek through the gap -->
            <div v-if="isFetched" class="px-3 pb-3">
              <TransactionsList
                ref="transactionsListRef"
                enable-bulk-edit
                :content-filters-active="contentFiltersActive"
                :transactions="transactionsPages?.pages.flat() ?? []"
                :has-next-page="hasNextPage"
                :is-fetching-next-page="isFetchingNextPage"
                :scroll-area-id="SCROLL_AREA_IDS.transactionsPage"
                @fetch-next-page="fetchNextPage"
              />
            </div>
          </ScrollArea>
        </Card>
      </template>

      <Card v-else class="shrink-0">
        <FiltersToolbar
          v-model:filters="filters"
          :is-reset-button-disabled="isResetButtonDisabled"
          @reset-filters="resetFilters"
        >
          <template #actions>
            <ColumnConfigPopover
              :configurable-columns="configurableColumns"
              @toggle="toggleColumn"
              @reorder="reorderColumns"
              @reset="resetToDefaults"
            />
          </template>
        </FiltersToolbar>
      </Card>

      <Card v-if="!isMobileMode || mobileView === 'table'" class="min-h-0 flex-1 overflow-hidden">
        <TransactionsTable
          ref="tableRef"
          :transactions="transactionsPages?.pages.flat() ?? []"
          :visible-columns="visibleColumns"
          :sorting="sorting"
          :has-next-page="hasNextPage"
          :is-fetching-next-page="isFetchingNextPage"
          :is-fetched="isFetched"
          :is-mobile-mode="isMobileMode"
          @update:sorting="onSortingChange"
          @fetch-next-page="fetchNextPage"
          @reset-filters="resetFilters"
        />
      </Card>
    </div>
  </PageWrapper>
</template>

<script lang="ts" setup>
import PageWrapper from '@/components/common/page-wrapper.vue';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { isAnyGroupDissolvingFilterActive } from '@/components/records-filters/filter-registry';
import FiltersDialog from '@/components/records-filters/filters-dialog.vue';
import FiltersPanel from '@/components/records-filters/index.vue';
import { useTransactionsWithFilters } from '@/components/records-filters/transactions-with-filters';
import { useFiltersFromQuery } from '@/components/records-filters/use-filters-from-query';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { ListIcon, Table2Icon } from '@lucide/vue';
import { useDebounceFn, useElementSize } from '@vueuse/core';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { trackNewlyActiveFilters } from './components/filter-analytics';
import FiltersToolbar from './components/filters-toolbar.vue';
import ColumnConfigPopover from './components/table/column-config-popover.vue';
import { DEFAULT_SORTING, type TableSorting } from './components/table/columns';
import TransactionsTable from './components/table/transactions-table.vue';
import { useTableColumns } from './components/table/use-table-columns';
import { useMobileView } from './components/use-mobile-view';

const sorting = ref<TableSorting>({ ...DEFAULT_SORTING });

const {
  isResetButtonDisabled,
  isAnyFiltersApplied,
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
} = useTransactionsWithFilters({ sorting });

const { visibleColumns, configurableColumns, toggleColumn, reorderColumns, resetToDefaults } = useTableColumns();

// Mobile mode keys off the content container, not the viewport – the sidebar
// eats ~300px, so viewport breakpoints would flip at the wrong widths.
const MOBILE_MODE_MAX_WIDTH_PX = 672;
const pageContentRef = ref<HTMLElement | null>(null);
const { width: pageContentWidth } = useElementSize(pageContentRef);
// Width is 0 until the first measurement – stay in desktop mode for that frame
// so the page doesn't flash the mobile layout on wide screens.
const isMobileMode = computed(() => pageContentWidth.value > 0 && pageContentWidth.value < MOBILE_MODE_MAX_WIDTH_PX);

const { mobileView, setMobileView } = useMobileView();

const isFiltersDialogOpen = ref(false);

// Filters apply automatically – no Apply button. One debounce window covers
// both typed inputs (coalesces keystrokes) and discrete controls (near-instant).
const FILTER_AUTO_APPLY_DEBOUNCE_MS = 400;
const applyFiltersDebounced = useDebounceFn(applyFilters, FILTER_AUTO_APPLY_DEBOUNCE_MS);
watch(filters, (next, previous) => {
  trackNewlyActiveFilters({ previous, current: next });
  applyFiltersDebounced();
});

// Content filters dissolve groups in the list view – only date filters keep
// groups visible.
const contentFiltersActive = computed(() => isAnyGroupDissolvingFilterActive(appliedFilters.value));

const tableRef = ref<InstanceType<typeof TransactionsTable> | null>(null);

const onSortingChange = (value: TableSorting) => {
  sorting.value = value;
  tableRef.value?.scrollToTop();
};

const route = useRoute();
const router = useRouter();
const { parseFiltersFromQuery } = useFiltersFromQuery();

// Initialize filters from query parameters (e.g. deep links from the dashboard)
onMounted(() => {
  const queryFilters = parseFiltersFromQuery({ query: route.query });

  if (queryFilters) {
    const initialFilters = { ...filters.value, ...queryFilters };

    filters.value = initialFilters;
    appliedFilters.value = initialFilters;

    // Clear query params from URL (replace to preserve back navigation to dashboard)
    router.replace({ query: {} });
  }
});
</script>
