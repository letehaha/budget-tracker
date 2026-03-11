<script lang="ts" setup>
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { useScrollAreaContainer } from '@/composable/scroll-area-container';
import { useTransactionSelection } from '@/composable/transaction-selection';
import { useBulkUpdateCategory } from '@/composable/use-bulk-update-category';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { createReusableTemplate } from '@vueuse/core';
import { computed, defineAsyncComponent, ref, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';

import { SCROLL_AREA_IDS } from '../lib/ui/scroll-area/types';
import AddToGroupDialog from './add-to-group-dialog.vue';
import BulkEditDialog, { type BulkEditFormValues } from './bulk-edit-dialog.vue';
import BulkEditToolbar from './bulk-edit-toolbar.vue';
import CreateGroupDialog from './create-group-dialog.vue';
import TransactionGroupRecord, { type GroupRowData } from './transaction-group-record.vue';
import TransactionRecord from './transaction-record.vue';

const { t } = useI18n();

const ManageTransactionDialogContent = defineAsyncComponent(
  () => import('@/components/dialogs/manage-transaction/dialog-content.vue'),
);
const TransactionGroupDialog = defineAsyncComponent(
  () => import('@/pages/transaction-groups/transaction-group-dialog.vue'),
);

const props = withDefaults(
  defineProps<{
    transactions: TransactionModel[];
    isTransactionRecord?: boolean;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    paginate?: boolean;
    scrollAreaId?: SCROLL_AREA_IDS;
    rawList?: boolean; // whenever we don't need to show anything except actual records
    maxDisplay?: number; // maximum number of items to display after deduplication
    enableBulkEdit?: boolean;
    /** When true, content filters are active — groups dissolve and individual transactions show */
    contentFiltersActive?: boolean;
  }>(),
  {
    isTransactionRecord: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    paginate: true,
    scrollAreaId: SCROLL_AREA_IDS.dashboard,
    enableBulkEdit: false,
    contentFiltersActive: false,
  },
);
const emits = defineEmits(['fetch-next-page']);
const [UseDialogTemplate, SlotContent] = createReusableTemplate();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const isDialogVisible = ref(false);
const defaultDialogProps = {
  transaction: undefined,
  oppositeTransaction: undefined,
};
const dialogProps = ref<{
  transaction: TransactionModel | undefined;
  oppositeTransaction: TransactionModel | undefined;
}>(defaultDialogProps);

watch(isDialogVisible, (value) => {
  if (value === false) dialogProps.value = defaultDialogProps;
});

const isCompactDialog = computed(
  () => dialogProps.value.transaction?.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
);

const handlerRecordClick = ([baseTx, oppositeTx]: [
  baseTx: TransactionModel,
  oppositeTx: TransactionModel | undefined,
]) => {
  const isExternalTransfer =
    baseTx.accountType !== ACCOUNT_TYPES.system || (oppositeTx && oppositeTx.accountType !== ACCOUNT_TYPES.system);

  const modalOptions: typeof dialogProps.value = {
    transaction: baseTx,
    oppositeTransaction: undefined,
  };

  if (isExternalTransfer) {
    const isBaseExternal = baseTx.accountType !== ACCOUNT_TYPES.system;

    modalOptions.transaction = isBaseExternal ? baseTx : oppositeTx;
    modalOptions.oppositeTransaction = isBaseExternal ? oppositeTx : baseTx;
  } else if (!isExternalTransfer && baseTx.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer) {
    const isValid = baseTx.transactionType === TRANSACTION_TYPES.expense;

    modalOptions.transaction = isValid ? baseTx : oppositeTx;
    modalOptions.oppositeTransaction = isValid ? oppositeTx : baseTx;
  }

  isDialogVisible.value = true;
  dialogProps.value = modalOptions;
};

const getDisplayItemKey = (item: DisplayItem | undefined, index: number): string | number => {
  if (!item) return index;
  if (isGroupRow(item)) return `group-${item.groupId}`;
  return `${item.id}-${item.updatedAt}`;
};

const scrollContainer = useScrollAreaContainer(props.scrollAreaId);

const listContainerRef = ref<HTMLElement | null>(null);
const scrollMargin = ref(0);

// Measure distance from scroll element top to list container top.
// TanStack Virtual needs this when the list is offset within the scroll element.
watch(listContainerRef, (el) => {
  const scrollEl = scrollContainer?.value?.viewportElement;
  if (el && scrollEl) {
    scrollMargin.value = el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
  }
});

type DisplayItem = TransactionModel | GroupRowData;

const isGroupRow = (item: DisplayItem): item is GroupRowData => 'type' in item && item.type === 'group';

/**
 * Smart container: Process transactions for display
 * - Deduplicate transfers by showing only expense side
 * - Replace grouped transactions with a single group row (unless content filters are active)
 */
const displayTransactions = computed<DisplayItem[]>(() => {
  const seen = new Set<string>();

  const deduplicated = props.transactions.filter((tx) => {
    if (!tx.transferId) return true;
    if (tx.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) return true;
    if (tx.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer) {
      if (seen.has(tx.transferId)) return false;
      if (tx.transactionType === TRANSACTION_TYPES.expense) {
        seen.add(tx.transferId);
        return true;
      }
      return false;
    }
    return true;
  });

  // When content filters are active, dissolve groups — show individual transactions
  if (props.contentFiltersActive) {
    return props.maxDisplay ? deduplicated.slice(0, props.maxDisplay) : deduplicated;
  }

  // Group transactions by groupId and replace with group rows
  const groupedTxs = new Map<number, TransactionModel[]>();
  const ungrouped: TransactionModel[] = [];

  for (const tx of deduplicated) {
    const groupInfo = tx.transactionGroups?.[0];
    if (groupInfo) {
      const existing = groupedTxs.get(groupInfo.id);
      if (existing) {
        existing.push(tx);
      } else {
        groupedTxs.set(groupInfo.id, [tx]);
      }
    } else {
      ungrouped.push(tx);
    }
  }

  // Build display items: ungrouped transactions + group rows at newest member date
  const items: DisplayItem[] = [...ungrouped];

  for (const [groupId, txs] of groupedTxs) {
    const groupName = txs[0]!.transactionGroups![0]!.name;
    const dates = txs.map((tx) => new Date(tx.time).getTime());
    const dateFrom = new Date(Math.min(...dates));
    const dateTo = new Date(Math.max(...dates));

    const groupRow: GroupRowData = {
      type: 'group',
      groupId,
      groupName,
      transactionCount: txs.length,
      dateFrom,
      dateTo,
    };

    // Insert at position of the newest transaction date
    const newestTime = Math.max(...dates);
    const insertIndex = items.findIndex((item) => {
      const itemTime = isGroupRow(item) ? item.dateTo.getTime() : new Date(item.time).getTime();
      return itemTime <= newestTime;
    });

    if (insertIndex === -1) {
      items.push(groupRow);
    } else {
      items.splice(insertIndex, 0, groupRow);
    }
  }

  return props.maxDisplay ? items.slice(0, props.maxDisplay) : items;
});

// Bulk edit selection
const {
  selectedCount,
  isAllSelected,
  isTransactionSelectable,
  isTransactionSelected,
  toggleTransaction,
  selectAll,
  clearSelection,
  getSelectedTransactionIds,
} = useTransactionSelection({
  getTransactions: () => displayTransactions.value.filter((item): item is TransactionModel => !isGroupRow(item)),
});

const handleSelectAllToggle = (checked: boolean) => {
  if (checked) {
    selectAll();
  } else {
    clearSelection();
  }
};

const bulkUpdateMutation = useBulkUpdateCategory({
  onSuccess: () => {
    clearSelection();
    isBulkEditDialogOpen.value = false;
  },
});

const isBulkEditDialogOpen = ref(false);
const isCreateGroupDialogOpen = ref(false);

const handleOpenBulkEditDialog = () => {
  isBulkEditDialogOpen.value = true;
};

const handleOpenCreateGroupDialog = () => {
  isCreateGroupDialogOpen.value = true;
};

const handleGroupCreated = () => {
  clearSelection();
};

// Add to existing group
const isAddToGroupDialogOpen = ref(false);

const handleOpenAddToGroupDialog = () => {
  isAddToGroupDialogOpen.value = true;
};

const handleAddedToGroup = () => {
  clearSelection();
};

// Group detail dialog
const isGroupDialogOpen = ref(false);
const groupDialogKey = ref(0);
const groupDialogId = ref<number | undefined>();

const handleGroupRowClick = (groupId: number) => {
  groupDialogId.value = groupId;
  groupDialogKey.value++;
  isGroupDialogOpen.value = true;
};

const handleBulkApply = (values: BulkEditFormValues) => {
  const transactionIds = getSelectedTransactionIds();

  bulkUpdateMutation.mutate({
    transactionIds,
    ...(values.categoryId !== undefined && { categoryId: values.categoryId }),
    ...(values.tagIds !== undefined && { tagIds: values.tagIds, tagMode: values.tagMode }),
    ...(values.note !== undefined && { note: values.note }),
  });
};

const virtualizer = useVirtualizer(
  computed(() => ({
    count: displayTransactions.value.length + (props.hasNextPage ? 1 : 0),
    getScrollElement: () => scrollContainer?.value?.viewportElement,
    estimateSize: () => 52 + 8,
    overscan: 10,
    scrollMargin: scrollMargin.value,
    enabled: props.paginate && !!scrollContainer?.value?.viewportElement,
  })),
);

defineExpose({
  virtualizer,
  scrollToIndex: (index: number) => virtualizer.value.scrollToIndex(index),
  scrollToOffset: (offset: number) => virtualizer.value.scrollToOffset(offset),
});

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

watchEffect(() => {
  const [lastItem] = [...virtualRows.value].reverse();

  if (!lastItem) return;

  if (lastItem.index >= displayTransactions.value.length - 1 && props.hasNextPage && !props.isFetchingNextPage) {
    emits('fetch-next-page');
  }
});
</script>

<template>
  <div>
    <!-- Bulk edit toolbar -->
    <BulkEditToolbar
      v-if="enableBulkEdit && displayTransactions.length > 0"
      :selected-count="selectedCount"
      :is-all-selected="isAllSelected"
      :is-loading="bulkUpdateMutation.isPending.value"
      @cancel="clearSelection"
      @edit="handleOpenBulkEditDialog"
      @create-group="handleOpenCreateGroupDialog"
      @add-to-group="handleOpenAddToGroupDialog"
      @select-all="handleSelectAllToggle"
    />

    <!-- Bulk edit dialog -->
    <BulkEditDialog
      v-model:open="isBulkEditDialogOpen"
      :selected-count="selectedCount"
      :is-loading="bulkUpdateMutation.isPending.value"
      @apply="handleBulkApply"
    />

    <!-- Create group dialog -->
    <CreateGroupDialog
      v-model:open="isCreateGroupDialogOpen"
      :transaction-ids="getSelectedTransactionIds()"
      @created="handleGroupCreated"
    />

    <!-- Add to existing group dialog -->
    <AddToGroupDialog
      v-model:open="isAddToGroupDialogOpen"
      :transaction-ids="getSelectedTransactionIds()"
      @added="handleAddedToGroup"
    />

    <template v-if="paginate">
      <div ref="listContainerRef" class="relative">
        <div v-bind="$attrs" v-if="transactions" class="w-full">
          <div :style="{ height: `${totalSize}px` }" class="relative">
            <div
              v-for="virtualRow in virtualRows"
              :key="getDisplayItemKey(displayTransactions[virtualRow.index], virtualRow.index)"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }"
            >
              <template v-if="displayTransactions[virtualRow.index]">
                <!-- Group row -->
                <TransactionGroupRecord
                  v-if="isGroupRow(displayTransactions[virtualRow.index]!)"
                  :group="displayTransactions[virtualRow.index] as GroupRowData"
                  @click="handleGroupRowClick"
                />
                <!-- Transaction row -->
                <div v-else class="flex items-center gap-1">
                  <slot name="row-leading" :tx="displayTransactions[virtualRow.index] as TransactionModel" />
                  <div class="min-w-0 flex-1">
                    <TransactionRecord
                      :tx="displayTransactions[virtualRow.index] as TransactionModel"
                      :show-checkbox="enableBulkEdit"
                      :is-selected="
                        isTransactionSelected((displayTransactions[virtualRow.index] as TransactionModel).id)
                      "
                      :is-selectable="
                        isTransactionSelectable(displayTransactions[virtualRow.index] as TransactionModel)
                      "
                      :index="virtualRow.index"
                      @record-click="handlerRecordClick"
                      @selection-change="toggleTransaction"
                    />
                  </div>
                  <slot name="row-trailing" :tx="displayTransactions[virtualRow.index] as TransactionModel" />
                </div>
              </template>
            </div>
          </div>

          <div v-if="!rawList" class="flex h-10 items-center justify-center">
            <template v-if="!hasNextPage">{{ t('transactions.list.noMoreData') }}</template>
          </div>
        </div>

        <div
          v-if="!rawList"
          class="absolute right-0 bottom-0 left-0 flex h-10 items-center justify-center bg-white/5 empty:hidden"
        >
          <template v-if="isFetchingNextPage">{{ t('transactions.list.loadingMore') }}</template>
        </div>
      </div>
    </template>
    <template v-else>
      <div v-bind="$attrs" class="grid grid-cols-1 gap-2">
        <template v-for="(item, index) in displayTransactions" :key="getDisplayItemKey(item, index)">
          <TransactionGroupRecord v-if="isGroupRow(item)" :group="item" @click="handleGroupRowClick" />
          <div v-else class="flex items-center gap-1">
            <slot name="row-leading" :tx="item" />
            <div class="min-w-0 flex-1">
              <TransactionRecord
                :tx="item"
                :show-checkbox="enableBulkEdit"
                :is-selected="isTransactionSelected(item.id)"
                :is-selectable="isTransactionSelectable(item)"
                :index="index"
                @record-click="handlerRecordClick"
                @selection-change="toggleTransaction"
              />
            </div>
            <slot name="row-trailing" :tx="item" />
          </div>
        </template>
      </div>
    </template>

    <UseDialogTemplate>
      <ManageTransactionDialogContent v-bind="dialogProps" @close-modal="isDialogVisible = false" />
    </UseDialogTemplate>

    <template v-if="isMobile">
      <Drawer.Drawer v-model:open="isDialogVisible">
        <Drawer.DrawerContent custom-indicator>
          <Drawer.DrawerTitle class="sr-only">{{ t('transactions.list.detailsTitle') }}</Drawer.DrawerTitle>
          <Drawer.DrawerDescription class="sr-only">{{
            t('transactions.list.detailsDescription')
          }}</Drawer.DrawerDescription>
          <SlotContent />
        </Drawer.DrawerContent>
      </Drawer.Drawer>
    </template>
    <template v-else>
      <Dialog.Dialog v-model:open="isDialogVisible">
        <Dialog.DialogContent
          custom-close
          :class="['bg-card max-h-[90dvh] w-full p-0', isCompactDialog ? 'max-w-lg' : 'max-w-225']"
        >
          <Dialog.DialogTitle class="sr-only">{{ t('transactions.list.detailsTitle') }}</Dialog.DialogTitle>
          <Dialog.DialogDescription class="sr-only">{{
            t('transactions.list.detailsDescription')
          }}</Dialog.DialogDescription>
          <SlotContent />
        </Dialog.DialogContent>
      </Dialog.Dialog>
    </template>

    <!-- Group detail dialog -->
    <TransactionGroupDialog v-model:open="isGroupDialogOpen" :key="groupDialogKey" :group-id="groupDialogId" />
  </div>
</template>
