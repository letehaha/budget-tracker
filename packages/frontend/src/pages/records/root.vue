<template>
  <PageWrapper>
    <div
      ref="pageContentRef"
      :class="[
        'flex flex-col gap-4',
        // Mobile uses min-h so the table can push past the viewport and the page
        // becomes scrollable – lets the user swipe away the toolbar to gain a few
        // extra rows of table.
        isMobileMode
          ? 'min-h-[calc(100dvh-var(--header-height)-32px)]'
          : 'h-[calc(100dvh-var(--header-height)-32px)] min-h-0',
      ]"
    >
      <!-- Mobile compact layout: filters behind a dialog button, user toggles
           between the compact list and the full table. -->
      <template v-if="showMobileLayout">
        <div class="flex shrink-0 items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <div class="bg-card flex items-center gap-0.5 rounded-md border p-0.5">
              <DesktopOnlyTooltip :content="$t('transactions.table.viewToggle.list')">
                <Button
                  :variant="activeView === 'list' ? 'secondary' : 'ghost'"
                  size="icon-sm"
                  :aria-label="$t('transactions.table.viewToggle.list')"
                  @click="setActiveView('list')"
                >
                  <ListIcon class="size-4" />
                </Button>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip :content="$t('transactions.table.viewToggle.table')">
                <Button
                  :variant="activeView === 'table' ? 'secondary' : 'ghost'"
                  size="icon-sm"
                  :aria-label="$t('transactions.table.viewToggle.table')"
                  @click="setActiveView('table')"
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

          <div class="flex items-center gap-2">
            <DesktopOnlyTooltip :content="$t('transactions.table.fullscreen.enter')">
              <Button
                variant="secondary"
                size="icon"
                :aria-label="$t('transactions.table.fullscreen.enter')"
                @click="enterFullscreen"
              >
                <Maximize2Icon class="size-4" />
              </Button>
            </DesktopOnlyTooltip>
          </div>
        </div>

        <Card v-if="activeView === 'list'" class="min-h-75 flex-1 overflow-hidden">
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

      <!-- Desktop list view: sticky filters sidebar on the left + the casual
           list of transactions on the right. The view toggle sits at the top
           of the sidebar so it stays in the page's top-left corner. -->
      <div v-if="showDesktopListLayout" class="flex min-h-0 flex-1 gap-4">
        <Card class="flex w-87.5 shrink-0 flex-col gap-3 overflow-hidden p-4">
          <div class="flex items-center justify-between gap-2">
            <div class="bg-card flex items-center gap-0.5 rounded-md border p-0.5">
              <DesktopOnlyTooltip :content="$t('transactions.table.viewToggle.list')">
                <Button
                  :variant="desktopView === 'list' ? 'secondary' : 'ghost'"
                  size="icon-sm"
                  :aria-label="$t('transactions.table.viewToggle.list')"
                  @click="setDesktopView('list')"
                >
                  <ListIcon class="size-4" />
                </Button>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip :content="$t('transactions.table.viewToggle.table')">
                <Button
                  :variant="desktopView === 'table' ? 'secondary' : 'ghost'"
                  size="icon-sm"
                  :aria-label="$t('transactions.table.viewToggle.table')"
                  @click="setDesktopView('table')"
                >
                  <Table2Icon class="size-4" />
                </Button>
              </DesktopOnlyTooltip>
            </div>
          </div>

          <ScrollArea class="-mx-4 min-h-0 flex-1">
            <div class="px-4">
              <!-- Filters auto-apply (debounced); panel's Apply button is
                   permanently suppressed via is-filters-out-of-sync=false. -->
              <FiltersPanel
                v-model:filters="filters"
                :is-reset-button-disabled="isResetButtonDisabled"
                :is-filters-out-of-sync="false"
                @reset-filters="resetFilters"
              />
            </div>
          </ScrollArea>
        </Card>

        <Card class="min-w-0 flex-1 overflow-hidden">
          <ScrollArea class="h-full" :scroll-area-id="SCROLL_AREA_IDS.transactionsPage">
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
      </div>

      <Card v-if="showDesktopToolbar" class="shrink-0">
        <FiltersToolbar
          v-model:filters="filters"
          :is-reset-button-disabled="isResetButtonDisabled"
          @reset-filters="resetFilters"
        >
          <template #prefix>
            <div class="mr-2 mb-2 inline-block align-top">
              <div class="bg-card flex h-10 items-center gap-0.5 rounded-md border p-0.5">
                <DesktopOnlyTooltip :content="$t('transactions.table.viewToggle.list')">
                  <Button
                    :variant="desktopView === 'list' ? 'secondary' : 'ghost'"
                    size="icon-sm"
                    :aria-label="$t('transactions.table.viewToggle.list')"
                    @click="setDesktopView('list')"
                  >
                    <ListIcon class="size-4" />
                  </Button>
                </DesktopOnlyTooltip>
                <DesktopOnlyTooltip :content="$t('transactions.table.viewToggle.table')">
                  <Button
                    :variant="desktopView === 'table' ? 'secondary' : 'ghost'"
                    size="icon-sm"
                    :aria-label="$t('transactions.table.viewToggle.table')"
                    @click="setDesktopView('table')"
                  >
                    <Table2Icon class="size-4" />
                  </Button>
                </DesktopOnlyTooltip>
              </div>
            </div>
          </template>

          <template #actions>
            <ColumnConfigPopover
              :configurable-columns="configurableColumns"
              @toggle="toggleColumn"
              @reorder="reorderColumns"
              @reset="resetToDefaults"
            />
            <DesktopOnlyTooltip :content="$t('transactions.table.fullscreen.enter')">
              <Button
                variant="secondary"
                size="icon"
                :aria-label="$t('transactions.table.fullscreen.enter')"
                @click="enterFullscreen"
              >
                <Maximize2Icon class="size-4" />
              </Button>
            </DesktopOnlyTooltip>
          </template>
        </FiltersToolbar>
      </Card>

      <!-- Teleport keeps the same TransactionsTable instance when fullscreen is
           toggled, so selection, scroll position, and infinite-scroll progress
           survive the transition. When disabled, renders inline in the flow. -->
      <Teleport to="body" :disabled="!isFullscreenMode">
        <div
          :class="
            isFullscreenMode
              ? 'bg-background fixed inset-0 z-40 flex flex-col gap-3 p-4'
              : showTableCard
                ? 'contents'
                : 'hidden'
          "
        >
          <template v-if="isFullscreenMode">
            <!-- Desktop focus mode keeps the inline filter row from the regular
                 table view; the exit button slots in alongside the other actions
                 so the layout matches what's familiar. -->
            <Card v-if="!isMobileMode" class="shrink-0">
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
                  <DesktopOnlyTooltip :content="$t('transactions.table.fullscreen.exit')">
                    <Button
                      variant="secondary"
                      :size="isTouchPointer ? 'icon' : 'sm'"
                      :aria-label="$t('transactions.table.fullscreen.exit')"
                      @click="exitFullscreen"
                    >
                      <template v-if="isTouchPointer">
                        <Minimize2Icon class="size-4" />
                      </template>
                      <template v-else>
                        <!-- Hint that the focus mode is Esc-dismissable; styled
                             like a physical key cap to read as a keyboard shortcut. -->
                        <kbd
                          class="bg-muted text-muted-foreground border-border inline-flex h-5 items-center rounded border px-1.5 font-mono text-xs"
                        >
                          Esc
                        </kbd>
                        {{ $t('common.ui.close') }}
                      </template>
                    </Button>
                  </DesktopOnlyTooltip>
                </template>
              </FiltersToolbar>
            </Card>

            <div v-else class="flex shrink-0 items-center justify-between gap-2">
              <Button variant="ghost" size="sm" @click="exitFullscreen">
                <Minimize2Icon class="size-4" />
                {{ $t('transactions.table.fullscreen.exit') }}
              </Button>

              <FiltersDialog v-model:open="isFiltersDialogOpen" :is-any-filters-applied="isAnyFiltersApplied">
                <FiltersPanel
                  v-model:filters="filters"
                  :is-reset-button-disabled="isResetButtonDisabled"
                  :is-filters-out-of-sync="false"
                  @reset-filters="resetFilters"
                />
              </FiltersDialog>
            </div>
          </template>

          <!-- On mobile (non-fullscreen) the card is sized to the full available
               viewport height; combined with the toolbar above this makes the
               page itself slightly taller than the viewport, so the user can
               swipe up to push the view toggle / filters bar off-screen and
               gain extra rows of table. -->
          <Card v-show="showTableCard" :class="['flex-1 overflow-hidden', tableCardSizingClass]">
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
      </Teleport>
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
import { ListIcon, Maximize2Icon, Minimize2Icon, Table2Icon } from '@lucide/vue';
import { useDebounceFn, useElementSize, useEventListener, useMediaQuery } from '@vueuse/core';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import type { TransactionsView } from '@/api/user-settings';

import { trackNewlyActiveFilters } from './components/filter-analytics';
import FiltersToolbar from './components/filters-toolbar.vue';
import ColumnConfigPopover from '@/components/common/column-config-popover.vue';
import { DEFAULT_SORTING, type TableSorting } from './components/table/columns';
import TransactionsTable from './components/table/transactions-table.vue';
import { useTableColumns } from './components/table/use-table-columns';
import { useTransactionsView } from './components/use-transactions-view';

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

const { mobileView, setMobileView, desktopView, setDesktopView } = useTransactionsView();

// User's preferred view for the current screen-size class. Drives both the
// active layout and which setting the toggle writes back to.
const activeView = computed<TransactionsView>(() => (isMobileMode.value ? mobileView.value : desktopView.value));
const setActiveView = (view: TransactionsView) => {
  if (isMobileMode.value) setMobileView(view);
  else setDesktopView(view);
};

// Mobile compact layout = view toggle + filters dialog + list/table card.
const showMobileLayout = computed(() => !isFullscreenMode.value && isMobileMode.value);

// Desktop list view restores the classic two-pane layout: a sticky sidebar of
// the full FiltersPanel on the left, the transactions list on the right.
const showDesktopListLayout = computed(
  () => !isFullscreenMode.value && !isMobileMode.value && desktopView.value === 'list',
);

// Desktop's inline filter row with the full table. The computed shields the
// v-if'd block from vue-tsc narrowing `desktopView` to `'table'`, which would
// make the toggle's `desktopView === 'list'` check unreachable.
const showDesktopToolbar = computed(
  () => !isMobileMode.value && !isFullscreenMode.value && desktopView.value === 'table',
);

const isFiltersDialogOpen = ref(false);

// Focus mode: a fixed-inset overlay that shows only the filters button and the
// table, hiding the surrounding page chrome (app header, sidebar/toolbar, view
// toggle) so the user can focus on reading rows.
const isFullscreenMode = ref(false);
// `pointer: coarse` flags touch input – used to hide the "Esc" hint on tablets
// where pressing Esc isn't an option.
const isTouchPointer = useMediaQuery('(pointer: coarse)');
const enterFullscreen = () => {
  isFullscreenMode.value = true;
};
const exitFullscreen = () => {
  isFullscreenMode.value = false;
};
useEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isFullscreenMode.value && !isFiltersDialogOpen.value) {
    exitFullscreen();
  }
});

// List view is unavailable in focus mode (which always shows the table); the
// wrapping div otherwise stays as `contents` so the table card sits in the
// page's flex flow.
const showTableCard = computed(() => isFullscreenMode.value || activeView.value === 'table');

// Mobile non-fullscreen: pin the card to ~viewport height to force page-level
// overflow (lets the user swipe away the toolbar). All other cases let flex-1
// share the remaining space inside the fixed-height container.
const tableCardSizingClass = computed(() =>
  isFullscreenMode.value || !isMobileMode.value ? 'min-h-0' : 'min-h-[calc(100dvh-var(--header-height))]',
);

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
