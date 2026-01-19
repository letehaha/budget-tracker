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
import BulkEditDialog, { type BulkEditFormValues } from './bulk-edit-dialog.vue';
import BulkEditToolbar from './bulk-edit-toolbar.vue';
import TransactionRecord from './transaction-record.vue';

const { t } = useI18n();

const ManageTransactionDoalogContent = defineAsyncComponent(
  () => import('@/components/dialogs/manage-transaction/dialog-content.vue'),
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
  }>(),
  {
    isTransactionRecord: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    paginate: true,
    scrollAreaId: SCROLL_AREA_IDS.dashboard,
    enableBulkEdit: false,
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
  transaction: TransactionModel;
  oppositeTransaction: TransactionModel;
}>(defaultDialogProps);

watch(isDialogVisible, (value) => {
  if (value === false) dialogProps.value = defaultDialogProps;
});

const handlerRecordClick = ([baseTx, oppositeTx]: [baseTx: TransactionModel, oppositeTx: TransactionModel]) => {
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

const getTransactionKey = (tx: TransactionModel | undefined, index: number): string | number => {
  if (!tx) return index;
  return `${tx.id}-${tx.updatedAt}`;
};

const scrollContainer = useScrollAreaContainer(props.scrollAreaId);

/**
 * Smart container: Process transactions for display
 * Deduplicate transfers by showing only expense side with opposite transaction attached
 */
const displayTransactions = computed(() => {
  const seen = new Set<string>();

  const deduplicated = props.transactions.filter((tx) => {
    // Not a transfer - always show
    if (!tx.transferId) {
      return true;
    }

    // Transfer out of wallet - always show (no opposite transaction, can be income or expense)
    if (tx.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
      return true;
    }

    // Common transfer - deduplicate by showing only expense side
    if (tx.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer) {
      // Skip if already processed
      if (seen.has(tx.transferId)) {
        return false;
      }

      // Only show expense side
      if (tx.transactionType === TRANSACTION_TYPES.expense) {
        seen.add(tx.transferId);
        return true;
      }

      // Income side - skip without marking as seen
      return false;
    }

    // Fallback: show the transaction
    return true;
  });

  // Limit to maxDisplay if specified
  return props.maxDisplay ? deduplicated.slice(0, props.maxDisplay) : deduplicated;
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
  getTransactions: () => displayTransactions.value,
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

const handleOpenBulkEditDialog = () => {
  isBulkEditDialogOpen.value = true;
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
      @select-all="handleSelectAllToggle"
    />

    <!-- Bulk edit dialog -->
    <BulkEditDialog
      v-model:open="isBulkEditDialogOpen"
      :selected-count="selectedCount"
      :is-loading="bulkUpdateMutation.isPending.value"
      @apply="handleBulkApply"
    />

    <template v-if="paginate">
      <div class="relative">
        <div v-bind="$attrs" v-if="transactions" class="w-full">
          <div :style="{ height: `${totalSize}px` }" class="relative">
            <div
              v-for="virtualRow in virtualRows"
              :key="getTransactionKey(displayTransactions[virtualRow.index], virtualRow.index)"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }"
            >
              <template v-if="displayTransactions[virtualRow.index]">
                <TransactionRecord
                  :tx="displayTransactions[virtualRow.index]"
                  :show-checkbox="enableBulkEdit"
                  :is-selected="isTransactionSelected(displayTransactions[virtualRow.index].id)"
                  :is-selectable="isTransactionSelectable(displayTransactions[virtualRow.index])"
                  :index="virtualRow.index"
                  @record-click="handlerRecordClick"
                  @selection-change="toggleTransaction"
                />
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
        <template v-for="(item, index) in displayTransactions" :key="`${item.id}-${item.updatedAt}`">
          <TransactionRecord
            :tx="item"
            :show-checkbox="enableBulkEdit"
            :is-selected="isTransactionSelected(item.id)"
            :is-selectable="isTransactionSelectable(item)"
            :index="index"
            @record-click="handlerRecordClick"
            @selection-change="toggleTransaction"
          />
        </template>
      </div>
    </template>

    <UseDialogTemplate>
      <ManageTransactionDoalogContent v-bind="dialogProps" @close-modal="isDialogVisible = false" />
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
        <Dialog.DialogContent custom-close class="bg-card max-h-[90dvh] w-full max-w-225 p-0">
          <Dialog.DialogTitle class="sr-only">{{ t('transactions.list.detailsTitle') }}</Dialog.DialogTitle>
          <Dialog.DialogDescription class="sr-only">{{
            t('transactions.list.detailsDescription')
          }}</Dialog.DialogDescription>
          <SlotContent />
        </Dialog.DialogContent>
      </Dialog.Dialog>
    </template>
  </div>
</template>
