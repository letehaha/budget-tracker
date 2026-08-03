<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import type { TableSorting } from '@/components/transactions-table/columns';
import TransactionsTable from '@/components/transactions-table/transactions-table.vue';
import { useTableColumns } from '@/components/transactions-table/use-table-columns';
import { useDateLocale } from '@/composable/use-date-locale';
import { ArrowLeftIcon, SearchXIcon, TriangleAlertIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

import { RUN_DATE_FORMAT } from '../run-date-format';
import { useRunTransactions } from '../use-run-transactions';

const props = defineProps<{ categorizedAt: string; isMobileMode: boolean }>();

const emit = defineEmits<{ back: [] }>();

const { format } = useDateLocale();
const { visibleColumns } = useTableColumns();

const {
  sorting,
  setSorting,
  transactions,
  isFetched,
  isLoadingError,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  refetch,
} = useRunTransactions({ categorizedAt: () => props.categorizedAt });

const runLabel = computed(() => format(props.categorizedAt, RUN_DATE_FORMAT));
const selectionScopeKey = computed(() => `${props.categorizedAt}:${sorting.value.sortBy}:${sorting.value.order}`);

const tableRef = ref<InstanceType<typeof TransactionsTable> | null>(null);

const onSortingChange = (value: TableSorting) => {
  setSorting(value);
  tableRef.value?.scrollToTop();
};
</script>

<template>
  <Card class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="flex min-h-12 shrink-0 items-center gap-2 border-b px-3">
      <DesktopOnlyTooltip :content="$t('optimizations.aiCategorization.history.backToRuns')">
        <Button
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground -ml-1 shrink-0"
          :aria-label="$t('optimizations.aiCategorization.history.backToRuns')"
          @click="emit('back')"
        >
          <ArrowLeftIcon class="size-4" />
        </Button>
      </DesktopOnlyTooltip>

      <span class="min-w-0 truncate text-sm font-medium">{{ runLabel }}</span>
    </div>

    <div v-if="isLoadingError" class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <TriangleAlertIcon class="text-destructive-text size-8" />
      <p class="text-destructive-text text-sm">{{ $t('optimizations.aiCategorization.history.runLoadError') }}</p>
      <Button variant="outline" size="sm" @click="refetch()">{{ $t('common.actions.retry') }}</Button>
    </div>

    <div
      v-else-if="isFetched && transactions.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <div class="bg-muted flex size-12 items-center justify-center rounded-full">
        <SearchXIcon class="text-muted-foreground size-6" />
      </div>
      <p class="font-medium">{{ $t('optimizations.aiCategorization.history.runEmptyTitle') }}</p>
      <p class="text-muted-foreground max-w-sm text-sm">
        {{ $t('optimizations.aiCategorization.history.runEmptyDescription') }}
      </p>
    </div>

    <TransactionsTable
      v-else
      ref="tableRef"
      class="min-h-0 flex-1"
      :transactions="transactions"
      :visible-columns="visibleColumns"
      :sorting="sorting"
      :has-next-page="hasNextPage"
      :is-fetching-next-page="isFetchingNextPage"
      :is-fetched="isFetched"
      :is-mobile-mode="isMobileMode"
      :selection-scope-key="selectionScopeKey"
      @update:sorting="onSortingChange"
      @fetch-next-page="fetchNextPage"
    >
      <template #toolbar />
    </TransactionsTable>
  </Card>
</template>
