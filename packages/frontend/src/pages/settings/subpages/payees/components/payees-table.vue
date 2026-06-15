<template>
  <div ref="wrapperRef" class="@container/payees-table">
    <div class="overflow-hidden rounded-md border">
      <!-- Compact-only sort control (column headers handle sorting on wide layouts) -->
      <div
        class="bg-muted/40 flex items-center justify-between gap-2 border-b px-3 py-2 text-xs @2xl/payees-table:hidden"
      >
        <span class="text-muted-foreground">{{ $t('payees.sort.label') }}</span>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <UiButton variant="ghost" size="sm" class="h-8 gap-1 px-2">
              {{ currentSortLabel }}
              <component :is="sortDir === 'asc' ? ArrowUpIcon : ArrowDownIcon" class="size-3.5" />
            </UiButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem v-for="opt in sortOptions" :key="opt.key" @click="setSort(opt.key)">
              {{ opt.label }}
              <component
                v-if="sortBy === opt.key"
                :is="sortDir === 'asc' ? ArrowUpIcon : ArrowDownIcon"
                class="ml-auto size-3.5"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <!-- Wide column header row -->
      <div
        :class="[
          'bg-muted text-muted-foreground hidden gap-3 border-b px-3 py-2 text-xs font-medium tracking-wider uppercase @2xl/payees-table:grid',
          DESKTOP_GRID,
        ]"
      >
        <SortHeaderButton
          :label="$t('payees.columns.name')"
          :active="sortBy === 'name'"
          :dir="sortDir"
          @click="setSort('name')"
        />
        <SortHeaderButton
          :label="$t('payees.columns.transactionCount')"
          align="right"
          :active="sortBy === 'transactionCount'"
          :dir="sortDir"
          @click="setSort('transactionCount')"
        />
        <SortHeaderButton
          :label="$t('payees.columns.netFlow')"
          align="right"
          :active="sortBy === 'netFlow'"
          :dir="sortDir"
          @click="setSort('netFlow')"
        />
        <span class="flex items-center gap-1">
          <span>{{ $t('payees.columns.category') }}</span>
          <ResponsiveTooltip :delay-duration="100" :content="$t('payees.columns.categoryHint')">
            <InfoIcon class="size-3 cursor-help" @click.prevent.stop />
          </ResponsiveTooltip>
        </span>
      </div>

      <!-- Loading state -->
      <div v-if="isLoading && list.length === 0" class="grid gap-1 p-2">
        <PayeeRowSkeleton v-for="i in SKELETON_ROW_COUNT" :key="i" />
      </div>

      <!-- Empty state -->
      <div v-else-if="list.length === 0" class="py-12 text-center">
        <div class="bg-muted mx-auto mb-3 flex size-12 items-center justify-center rounded-full">
          <PackageOpenIcon class="text-muted-foreground size-6" />
        </div>
        <p class="text-foreground mb-1 text-sm font-medium">{{ $t('payees.emptyState.title') }}</p>
        <p class="text-muted-foreground text-xs">{{ $t('payees.emptyState.description') }}</p>
      </div>

      <!-- Virtualized rows -->
      <div v-else ref="scrollRef" class="min-h-80 overflow-y-auto" :style="{ maxHeight: SCROLL_MAX_HEIGHT }">
        <div :style="{ height: `${totalSize}px`, position: 'relative' }">
          <div
            v-for="virtualRow in virtualRows"
            :key="getRowKey(virtualRow.index)"
            :data-index="virtualRow.index"
            :ref="(el) => measureRow(el as Element | null)"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }"
          >
            <router-link
              v-if="list[virtualRow.index]"
              :to="{ name: ROUTES_NAMES.settingsPayeeDetail, params: { id: list[virtualRow.index]!.id } }"
              class="hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-ring block border-b px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <!-- Compact (card) -->
              <div class="flex flex-col gap-1.5 @2xl/payees-table:hidden">
                <div class="flex items-center gap-2">
                  <PayeeLogo
                    :domain="list[virtualRow.index]!.logoDomain ?? null"
                    :name="list[virtualRow.index]!.name"
                    class="size-7 shrink-0"
                  />
                  <span class="text-foreground truncate text-sm font-medium">
                    {{ list[virtualRow.index]!.name }}
                  </span>
                </div>
                <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt class="text-muted-foreground">{{ $t('payees.columns.transactionCount') }}</dt>
                  <dd class="text-right tabular-nums">
                    {{ list[virtualRow.index]!.stats?.transactionCount ?? 0 }}
                  </dd>
                  <dt class="text-muted-foreground">{{ $t('payees.columns.netFlow') }}</dt>
                  <dd
                    class="text-right tabular-nums"
                    :class="netFlowClass(list[virtualRow.index]!.stats?.netFlowRef ?? 0)"
                  >
                    {{ formatNetFlow(list[virtualRow.index]!.stats?.netFlowRef ?? 0) }}
                  </dd>
                  <dt class="text-muted-foreground flex items-center gap-1">
                    <span>{{ $t('payees.columns.category') }}</span>
                    <ResponsiveTooltip :delay-duration="100" :content="$t('payees.columns.categoryHint')">
                      <InfoIcon class="size-3 cursor-help" @click.prevent.stop />
                    </ResponsiveTooltip>
                  </dt>
                  <dd class="flex min-w-0 justify-end">
                    <CategoryDisplay
                      :category-id="
                        list[virtualRow.index]!.defaultCategoryId ??
                        list[virtualRow.index]!.stats?.topCategoryId ??
                        null
                      "
                    />
                  </dd>
                </dl>
              </div>

              <!-- Wide (grid row) -->
              <div :class="['hidden items-center gap-3 text-sm @2xl/payees-table:grid', DESKTOP_GRID]">
                <div class="flex min-w-0 items-center gap-2">
                  <PayeeLogo
                    :domain="list[virtualRow.index]!.logoDomain ?? null"
                    :name="list[virtualRow.index]!.name"
                    class="size-7 shrink-0"
                  />
                  <span class="truncate font-medium">{{ list[virtualRow.index]!.name }}</span>
                </div>
                <span class="text-right tabular-nums">
                  {{ list[virtualRow.index]!.stats?.transactionCount ?? 0 }}
                </span>
                <span
                  class="text-right tabular-nums"
                  :class="netFlowClass(list[virtualRow.index]!.stats?.netFlowRef ?? 0)"
                >
                  {{ formatNetFlow(list[virtualRow.index]!.stats?.netFlowRef ?? 0) }}
                </span>
                <CategoryDisplay
                  :category-id="
                    list[virtualRow.index]!.defaultCategoryId ?? list[virtualRow.index]!.stats?.topCategoryId ?? null
                  "
                />
              </div>
            </router-link>
            <div v-else class="text-muted-foreground border-b px-3 py-3 text-center text-xs">
              {{ $t('payees.loadingMore') }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button as UiButton } from '@/components/lib/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/common/dropdown-menu';
import { useBaseCurrency } from '@/composable/data-queries/currencies';
import { useInfinitePayees } from '@/composable/data-queries/payees';
import { useVirtualizedInfiniteScroll } from '@/composable/virtualized-infinite-scroll';
import { ROUTES_NAMES } from '@/routes/constants';
import type { PayeeSortBy, PayeeSortDir } from '@/api/payees';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import { ArrowDownIcon, ArrowUpIcon, InfoIcon, PackageOpenIcon } from '@lucide/vue';
import { useElementSize } from '@vueuse/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import CategoryDisplay from './category-display.vue';
import PayeeLogo from './payee-logo.vue';
import PayeeRowSkeleton from './payee-row-skeleton.vue';
import SortHeaderButton from './sort-header-button.vue';

const SKELETON_ROW_COUNT = 6;
// Cap the list to (viewport - everything-above-the-table) so the table itself
// is the only thing that scrolls — no nested scrollbars on the page. The
// subtraction covers the app header, settings card header, tabs, search row,
// and inter-section padding. `min-h-80` keeps it usable on tiny viewports.
const SCROLL_VERTICAL_OFFSET_PX = 340;
const SCROLL_MAX_HEIGHT = `calc(100dvh - ${SCROLL_VERTICAL_OFFSET_PX}px)`;
// Mirrors Tailwind's `@2xl` container-query breakpoint (42rem = 672px) so the
// virtualizer's row-height estimate switches in step with the CSS layout flip.
const COMPACT_BREAKPOINT_PX = 672;
const COMPACT_ROW_ESTIMATE_PX = 140;
const WIDE_ROW_ESTIMATE_PX = 48;
const DESKTOP_GRID = 'grid-cols-[2fr_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.8fr)]';
const NET_FLOW_FALLBACK_CURRENCY = 'USD';

const props = defineProps<{
  searchQuery?: string;
}>();

const { t, locale } = useI18n();

const sortBy = ref<PayeeSortBy>('transactionCount');
const sortDir = ref<PayeeSortDir>('desc');

const sortOptions = computed<ReadonlyArray<{ key: PayeeSortBy; label: string }>>(() => [
  { key: 'transactionCount', label: t('payees.sort.transactionCount') },
  { key: 'netFlow', label: t('payees.sort.netFlow') },
  { key: 'name', label: t('payees.sort.name') },
  { key: 'lastSeen', label: t('payees.sort.lastSeen') },
]);

const currentSortLabel = computed(
  () => sortOptions.value.find((o) => o.key === sortBy.value)?.label ?? sortOptions.value[0]!.label,
);

const setSort = (key: PayeeSortBy) => {
  if (sortBy.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = key;
    // Numbers default to descending (largest first) — that's the natural read.
    // Name defaults to ascending (A → Z).
    sortDir.value = key === 'name' ? 'asc' : 'desc';
  }
};

const debouncedQuery = computed(() => (props.searchQuery ?? '').trim() || undefined);

const { list, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfinitePayees({
  q: debouncedQuery,
  sortBy,
  sortDir,
});

const wrapperRef = ref<HTMLElement | null>(null);
const { width: wrapperWidth } = useElementSize(wrapperRef);
const isCompact = computed(() => wrapperWidth.value > 0 && wrapperWidth.value < COMPACT_BREAKPOINT_PX);

const scrollRef = ref<HTMLElement | null>(null);

const { virtualizer, virtualRows, totalSize } = useVirtualizedInfiniteScroll({
  items: list,
  hasNextPage: computed(() => hasNextPage.value ?? false),
  fetchNextPage: () => fetchNextPage(),
  isFetchingNextPage: computed(() => isFetchingNextPage.value ?? false),
  parentRef: scrollRef,
  estimateSize: () => (isCompact.value ? COMPACT_ROW_ESTIMATE_PX : WIDE_ROW_ESTIMATE_PX),
  overscan: 8,
  getItemKey: (index) => list.value[index]?.id ?? `idx-${index}`,
});

const measureRow = (el: Element | null) => {
  if (el) virtualizer.value.measureElement(el as HTMLElement);
};

const getRowKey = (index: number) => list.value[index]?.id ?? `pending-${index}`;

const { data: baseCurrency } = useBaseCurrency();
const refCurrencyCode = computed(() => baseCurrency.value?.currencyCode ?? NET_FLOW_FALLBACK_CURRENCY);
const formatNetFlow = (val: number) =>
  new Intl.NumberFormat(locale.value, {
    style: 'currency',
    currency: refCurrencyCode.value,
    signDisplay: 'always',
    maximumFractionDigits: 0,
  }).format(val);

const netFlowClass = (val: number) => {
  if (val > 0) return 'text-app-income-color';
  if (val < 0) return 'text-app-expense-color';
  return '';
};
</script>
