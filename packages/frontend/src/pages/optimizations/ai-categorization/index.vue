<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import type { TableSorting } from '@/components/transactions-table/columns';
import TransactionsTable from '@/components/transactions-table/transactions-table.vue';
import { useTableColumns } from '@/components/transactions-table/use-table-columns';
import { ROUTES_NAMES } from '@/routes';
import { ArrowLeftIcon, CircleCheckIcon, SettingsIcon, TriangleAlertIcon } from '@lucide/vue';
import { useElementSize } from '@vueuse/core';
import { computed, ref } from 'vue';

import RunBar from './components/run-bar.vue';
import { useCategorizationRun } from './use-categorization-run';

const run = useCategorizationRun();
const {
  sorting,
  setSorting,
  candidates,
  candidatesUnavailable,
  isCandidatesFetched,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  refetchCandidates,
  isEverythingCategorized,
} = run;

const { visibleColumns } = useTableColumns();

// Narrow-layout flag comes from the page container: the sidebar eats ~300px, so
// viewport width flips this at the wrong moment.
const MOBILE_MODE_MAX_WIDTH_PX = 672;
const pageRef = ref<HTMLElement | null>(null);
const { width: pageWidth } = useElementSize(pageRef);
const isMobileMode = computed(() => pageWidth.value > 0 && pageWidth.value < MOBILE_MODE_MAX_WIDTH_PX);

const selectionScopeKey = computed(() => `${sorting.value.sortBy}:${sorting.value.order}`);

const tableRef = ref<InstanceType<typeof TransactionsTable> | null>(null);

const onSortingChange = (value: TableSorting) => {
  setSorting(value);
  tableRef.value?.scrollToTop();
};
</script>

<template>
  <!-- Bounded height + internal scrolling keeps the table's virtualizer working:
       in an unbounded container every virtual row stays mounted and the
       infinite-scroll sentinel keeps firing until the last page. -->
  <div
    ref="pageRef"
    class="flex h-[calc(100dvh-var(--header-height))] min-h-0 flex-col gap-3 overflow-hidden p-4 max-md:h-[calc(100dvh-var(--header-height)-var(--bottom-navbar-height))] md:p-6"
  >
    <div class="flex h-8 shrink-0 items-center gap-2">
      <DesktopOnlyTooltip :content="$t('optimizations.backToOptimizations')">
        <Button variant="ghost" size="icon-sm" class="text-muted-foreground -ml-1 shrink-0" as-child>
          <RouterLink :to="{ name: ROUTES_NAMES.optimizations }" :aria-label="$t('optimizations.backToOptimizations')">
            <ArrowLeftIcon class="size-4" />
          </RouterLink>
        </Button>
      </DesktopOnlyTooltip>

      <h1 class="truncate text-xl font-bold tracking-tight">
        {{ $t('optimizations.aiCategorization.title') }}
      </h1>
    </div>

    <Card class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div v-if="candidatesUnavailable" class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <TriangleAlertIcon class="text-destructive-text size-8" />
        <p class="text-destructive-text text-sm">{{ $t('optimizations.aiCategorization.table.loadError') }}</p>
        <Button variant="outline" size="sm" @click="refetchCandidates()">{{ $t('common.actions.retry') }}</Button>
      </div>

      <div
        v-else-if="isEverythingCategorized"
        class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <div class="bg-muted flex size-12 items-center justify-center rounded-full">
          <CircleCheckIcon class="text-success-text size-6" />
        </div>
        <p class="font-medium">{{ $t('optimizations.aiCategorization.count.allDoneTitle') }}</p>
        <p class="text-muted-foreground max-w-sm text-sm">
          {{ $t('optimizations.aiCategorization.count.allDoneDescription') }}
        </p>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: ROUTES_NAMES.settingsAiFeatures }">
            <SettingsIcon class="size-3.5" />
            {{ $t('optimizations.aiCategorization.setup.changeModel') }}
          </RouterLink>
        </Button>
      </div>

      <TransactionsTable
        v-else
        ref="tableRef"
        class="min-h-0 flex-1"
        :transactions="candidates"
        :visible-columns="visibleColumns"
        :sorting="sorting"
        :has-next-page="hasNextPage"
        :is-fetching-next-page="isFetchingNextPage"
        :is-fetched="isCandidatesFetched"
        :is-mobile-mode="isMobileMode"
        :selection-scope-key="selectionScopeKey"
        @update:sorting="onSortingChange"
        @fetch-next-page="fetchNextPage"
      >
        <template #toolbar="{ selectedCount, getSelectedTransactionIds, clearSelection }">
          <RunBar
            :run="run"
            :selected-count="selectedCount"
            :get-selected-transaction-ids="getSelectedTransactionIds"
            @clear-selection="clearSelection"
          />
        </template>
      </TransactionsTable>
    </Card>
  </div>
</template>
