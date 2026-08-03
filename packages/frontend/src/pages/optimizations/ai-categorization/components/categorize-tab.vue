<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import type { TableSorting } from '@/components/transactions-table/columns';
import TransactionsTable from '@/components/transactions-table/transactions-table.vue';
import { useTableColumns } from '@/components/transactions-table/use-table-columns';
import { ROUTES_NAMES } from '@/routes';
import { CircleCheckIcon, SettingsIcon, TriangleAlertIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

import { useCategorizationRun } from '../use-categorization-run';
import RunBar from './run-bar.vue';

defineProps<{ isMobileMode: boolean }>();

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

const selectionScopeKey = computed(() => `${sorting.value.sortBy}:${sorting.value.order}`);

const tableRef = ref<InstanceType<typeof TransactionsTable> | null>(null);

const onSortingChange = (value: TableSorting) => {
  setSorting(value);
  tableRef.value?.scrollToTop();
};
</script>

<template>
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
</template>
