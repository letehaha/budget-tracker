<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- Bulk actions bar: no vertical padding so both states stay exactly min-h tall (no jump on selection) -->
    <div class="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3">
      <span v-if="selectedCount > 0" class="text-sm whitespace-nowrap">
        {{ $t('transactions.bulkEdit.selectedCount', { count: selectedCount }) }}
      </span>
      <span v-else class="text-muted-foreground text-sm">
        {{ $t('transactions.table.hint') }}
      </span>

      <div v-if="selectedCount > 0" class="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" :disabled="isBulkLoading" @click="isBulkEditDialogOpen = true">
          <PencilIcon class="size-4" />
          {{ $t('transactions.bulkEdit.editButton') }}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" :disabled="isBulkLoading">
              <GroupIcon class="size-4" />
              {{ $t('transactions.transactionGroups.bulkActions.groupButton') }}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="min-w-48">
            <DropdownMenuItem :disabled="selectedCount < 2" @select="isCreateGroupDialogOpen = true">
              <PlusIcon class="mr-2 size-4" />
              {{ $t('transactions.transactionGroups.bulkActions.createNewGroup') }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="isAddToGroupDialogOpen = true">
              <ListPlusIcon class="mr-2 size-4" />
              {{ $t('transactions.transactionGroups.bulkActions.addToExistingGroup') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DesktopOnlyTooltip
          :content="
            hasExternalSelected ? $t('transactions.bulkDelete.externalTooltip') : $t('transactions.bulkDelete.button')
          "
        >
          <span class="inline-flex">
            <Button
              variant="soft-destructive"
              size="sm"
              :disabled="isBulkLoading || hasExternalSelected"
              @click="isBulkDeleteDialogOpen = true"
            >
              <Trash2Icon class="size-4" />
              {{ $t('transactions.bulkDelete.button') }}
            </Button>
          </span>
        </DesktopOnlyTooltip>

        <Button variant="ghost" size="sm" :disabled="isBulkLoading" @click="clearSelection">
          {{ $t('common.actions.cancel') }}
        </Button>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="isFetched && displayTransactions.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-3 py-16"
    >
      <div class="bg-muted flex size-12 items-center justify-center rounded-full">
        <SearchXIcon class="text-muted-foreground size-6" />
      </div>
      <p class="text-foreground font-medium">{{ $t('transactions.table.emptyTitle') }}</p>
      <p class="text-muted-foreground text-sm">{{ $t('transactions.table.emptyDescription') }}</p>
      <Button variant="outline" size="sm" @click="emit('reset-filters')">
        {{ $t('transactions.filters.reset') }}
      </Button>
    </div>

    <!-- overscroll-none disables the rubber-band bounce and scroll chaining past the table's edges -->
    <ScrollArea
      v-else
      ref="scrollAreaRef"
      class="min-h-0 flex-1"
      viewport-class="overscroll-none"
      with-horizontal-scrollbar
    >
      <!-- table-fixed: column widths come from the header only, so rows mounted
           mid-scroll by the virtualizer can never widen the table (which used to
           create transient horizontal overflow). min-width preserves the
           horizontal-scroll fallback when columns genuinely don't fit. -->
      <table class="w-full table-fixed border-separate border-spacing-0" :style="{ minWidth: `${tableMinWidthPx}px` }">
        <thead class="sticky top-0 z-2">
          <tr class="text-muted-foreground divide-x text-xs font-medium tracking-wider uppercase">
            <th class="bg-muted sticky left-0 z-1 w-8 border-b">
              <label class="flex size-full items-center justify-center">
                <Checkbox :model-value="selectAllState" @update:model-value="handleSelectAllToggle" />
              </label>
            </th>
            <th
              v-for="column in visibleColumns"
              :key="column.id"
              :class="[
                'bg-muted overflow-hidden border-b px-3 py-2 whitespace-nowrap',
                column.align === 'right' ? 'text-right' : 'text-left',
              ]"
              :style="{ width: `${column.widthPx}px` }"
            >
              <component
                :is="column.sortField ? 'button' : 'span'"
                :class="[
                  'inline-flex max-w-full items-center gap-1',
                  column.sortField && 'hover:text-foreground cursor-pointer transition-colors',
                  column.align === 'right' && 'justify-end',
                ]"
                v-on="column.sortField ? { click: () => onHeaderClick(column) } : {}"
              >
                <span class="truncate">{{ $t(column.labelKey) }}</span>
                <template v-if="column.sortField && sorting.sortBy === column.sortField">
                  <ArrowUpIcon v-if="sorting.order === SORT_DIRECTIONS.asc" class="size-3 shrink-0" />
                  <ArrowDownIcon v-else class="size-3 shrink-0" />
                </template>
              </component>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr v-if="paddingTop > 0" aria-hidden="true">
            <td :colspan="visibleColumns.length + 1" :style="{ height: `${paddingTop}px` }" class="p-0" />
          </tr>

          <template v-for="virtualRow in virtualRows" :key="rowKey(virtualRow.index)">
            <TransactionTableRow
              v-if="displayTransactions[virtualRow.index]"
              :tx="displayTransactions[virtualRow.index]!"
              :visible-columns="visibleColumns"
              :index="virtualRow.index"
              :is-selected="isTransactionSelected(displayTransactions[virtualRow.index]!.id)"
              :is-selectable="isTransactionSelectable(displayTransactions[virtualRow.index]!)"
              :unselectable-reason="getUnselectableReason(displayTransactions[virtualRow.index]!)"
              :payee-name="payeeNameById[displayTransactions[virtualRow.index]!.payeeId ?? '']"
              @record-click="handleRecordClick"
              @selection-change="toggleTransaction"
            />
            <tr v-else class="h-10">
              <td :colspan="visibleColumns.length + 1" class="border-b px-3">
                <div class="bg-muted h-4 w-full max-w-120 animate-pulse rounded" />
              </td>
            </tr>
          </template>

          <tr v-if="paddingBottom > 0" aria-hidden="true">
            <td :colspan="visibleColumns.length + 1" :style="{ height: `${paddingBottom}px` }" class="p-0" />
          </tr>
        </tbody>
      </table>

      <div
        v-if="!hasNextPage && displayTransactions.length > 0"
        class="text-muted-foreground flex h-10 items-center justify-center text-sm"
      >
        {{ $t('transactions.list.noMoreData') }}
      </div>
    </ScrollArea>

    <BulkActionDialogs :actions="bulkActions" />

    <TransactionDetailsModal v-model:open="isDialogVisible" :mobile="isMobileMode" :is-compact="isCompactDialog">
      <ManageTransactionDialogContent v-bind="dialogProps" @close-modal="closeDialog" />
    </TransactionDetailsModal>
  </div>
</template>

<script lang="ts" setup>
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/common/dropdown-menu';
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import BulkActionDialogs from '@/components/transactions-list/bulk-action-dialogs.vue';
import TransactionDetailsModal from '@/components/transactions-list/transaction-details-modal.vue';
import { useManageTransactionDialog } from '@/components/transactions-list/use-manage-transaction-dialog';
import { useTransactionsDisplay } from '@/components/transactions-list/use-transactions-display';
import { usePayees } from '@/composable/data-queries/payees';
import { useBulkTransactionActions } from '@/composable/use-bulk-transaction-actions';
import { SORT_DIRECTIONS, TRANSACTION_SORT_FIELD, TransactionModel } from '@bt/shared/types';
import { useVirtualizer } from '@tanstack/vue-virtual';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GroupIcon,
  ListPlusIcon,
  PencilIcon,
  PlusIcon,
  SearchXIcon,
  Trash2Icon,
} from '@lucide/vue';
import { type ComputedRef, computed, defineAsyncComponent, ref, watchEffect } from 'vue';

import { type ColumnDefinition, type TableSorting } from './columns';
import TransactionTableRow from './transaction-table-row.vue';

const ROW_HEIGHT_PX = 40;
const CHECKBOX_COLUMN_WIDTH_PX = 32;

const ManageTransactionDialogContent = defineAsyncComponent(
  () => import('@/components/dialogs/manage-transaction/dialog-content.vue'),
);

const props = defineProps<{
  transactions: TransactionModel[];
  visibleColumns: ColumnDefinition[];
  sorting: TableSorting;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetched: boolean;
  /**
   * Container-based narrow-layout flag from the page (the sidebar makes viewport
   * breakpoints unreliable here) — drives Drawer-vs-Dialog for the detail panel.
   */
  isMobileMode: boolean;
}>();

const emit = defineEmits<{
  'fetch-next-page': [];
  'update:sorting': [value: TableSorting];
  'reset-filters': [];
}>();

const tableMinWidthPx = computed(
  () => CHECKBOX_COLUMN_WIDTH_PX + props.visibleColumns.reduce((sum, column) => sum + column.widthPx, 0),
);

// Table view always flattens groups (one row per record); passing
// contentFiltersActive=true gives transfer dedup without group rows, so the
// display list never contains GroupRowData entries.
const { displayTransactions } = useTransactionsDisplay({
  transactions: () => props.transactions,
  contentFiltersActive: () => true,
}) as { displayTransactions: ComputedRef<TransactionModel[]> };

// Payee names: transactions carry only payeeId; resolve names from the payees list.
const { list: payeesList } = usePayees();
const payeeNameById = computed<Record<string, string>>(() =>
  Object.fromEntries((payeesList.value ?? []).map((payee) => [payee.id, payee.name])),
);

// Transaction detail dialog
const { isDialogVisible, dialogProps, isCompactDialog, handleRecordClick, closeDialog } = useManageTransactionDialog();

// Selection, eligibility, bulk mutations and dialog state — shared with the list view.
const bulkActions = useBulkTransactionActions({ getTransactions: () => displayTransactions.value });
const {
  selectedCount,
  isTransactionSelectable,
  isTransactionSelected,
  toggleTransaction,
  clearSelection,
  getUnselectableReason,
  hasExternalSelected,
  selectAllState,
  handleSelectAllToggle,
  isBulkEditDialogOpen,
  isCreateGroupDialogOpen,
  isAddToGroupDialogOpen,
  isBulkDeleteDialogOpen,
  isBulkLoading,
} = bulkActions;

// Sorting: click cycles asc → desc; switching column starts at asc; Date is the
// default sort so its cycle is desc → asc (matches the list default).
const onHeaderClick = (column: ColumnDefinition) => {
  if (!column.sortField) return;

  if (props.sorting.sortBy !== column.sortField) {
    const initialOrder = column.sortField === TRANSACTION_SORT_FIELD.time ? SORT_DIRECTIONS.desc : SORT_DIRECTIONS.asc;
    emit('update:sorting', { sortBy: column.sortField, order: initialOrder });
    return;
  }

  emit('update:sorting', {
    sortBy: column.sortField,
    order: props.sorting.order === SORT_DIRECTIONS.asc ? SORT_DIRECTIONS.desc : SORT_DIRECTIONS.asc,
  });
};

// Virtualization (fixed 40px rows, padding-row technique for <table>)
const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);
const getScrollElement = () => scrollAreaRef.value?.viewportRef?.viewportElement ?? null;

const virtualizer = useVirtualizer(
  computed(() => ({
    count: displayTransactions.value.length + (props.hasNextPage ? 1 : 0),
    getScrollElement,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 15,
  })),
);

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

const paddingTop = computed(() => (virtualRows.value.length > 0 ? virtualRows.value[0]!.start : 0));
const paddingBottom = computed(() =>
  virtualRows.value.length > 0 ? totalSize.value - virtualRows.value[virtualRows.value.length - 1]!.end : 0,
);

const rowKey = (index: number) => {
  const tx = displayTransactions.value[index];
  return tx ? `${tx.id}-${tx.updatedAt}` : `loader-${index}`;
};

// Infinite scroll: request the next page once the loader row becomes visible.
watchEffect(() => {
  const lastItem = virtualRows.value[virtualRows.value.length - 1];
  if (!lastItem) return;

  if (lastItem.index >= displayTransactions.value.length - 1 && props.hasNextPage && !props.isFetchingNextPage) {
    emit('fetch-next-page');
  }
});

defineExpose({
  scrollToTop: () => virtualizer.value.scrollToIndex(0),
});
</script>
