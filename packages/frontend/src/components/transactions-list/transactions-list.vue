<script lang="ts" setup>
import { useScrollAreaContainer } from '@/composable/scroll-area-container';
import { useBulkTransactionActions } from '@/composable/use-bulk-transaction-actions';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { TransactionModel } from '@bt/shared/types';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { createReusableTemplate } from '@vueuse/core';
import { computed, defineAsyncComponent, ref, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';

import { SCROLL_AREA_IDS } from '../lib/ui/scroll-area/types';
import BulkActionDialogs from './bulk-action-dialogs.vue';
import BulkEditToolbar from './bulk-edit-toolbar.vue';
import TransactionDetailsModal from './transaction-details-modal.vue';
import TransactionGroupRecord, { type GroupRowData } from './transaction-group-record.vue';
import TransactionRecord from './transaction-record.vue';
import { useManageTransactionDialog } from './use-manage-transaction-dialog';
import { getDisplayItemKey, isGroupRow, useTransactionsDisplay } from './use-transactions-display';

const { t } = useI18n();

const ManageTransactionDialogContent = defineAsyncComponent(
  () => import('@/components/dialogs/manage-transaction/dialog-content.vue'),
);
const TransactionGroupDialog = defineAsyncComponent(
  () => import('@/pages/transaction-groups/transaction-group-dialog.vue'),
);
const LoanPaymentDialog = defineAsyncComponent(() => import('@/pages/loans/components/loan-payment-dialog/index.vue'));

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
const [DefineRowTemplate, UseRowTemplate] = createReusableTemplate<{
  item: TransactionModel | GroupRowData;
  index: number;
}>();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

// Transaction display (deduplication, grouping, transfer normalization)
const { displayTransactions } = useTransactionsDisplay({
  transactions: () => props.transactions,
  contentFiltersActive: () => props.contentFiltersActive,
  maxDisplay: () => props.maxDisplay,
});

// Transaction detail dialog (Dialog on desktop, Drawer on mobile). transfer_to_loan
// pairs route to a separate, simpler loan dialog with its own visibility flag.
const {
  isDialogVisible,
  dialogProps,
  isCompactDialog,
  handleRecordClick,
  closeDialog,
  isLoanDialogVisible,
  loanDialogProps,
  closeLoanDialog,
} = useManageTransactionDialog();

// Scroll / virtualizer setup
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

// Selection, eligibility, bulk mutations and dialog state — shared with the table view.
const bulkActions = useBulkTransactionActions({
  getTransactions: () => displayTransactions.value.filter((item): item is TransactionModel => !isGroupRow(item)),
});
const {
  selectedCount,
  isAllSelected,
  isTransactionSelectable,
  isTransactionSelected,
  toggleTransaction,
  clearSelection,
  getUnselectableReason,
  hasExternalSelected,
  handleSelectAllToggle,
  isBulkEditDialogOpen,
  isCreateGroupDialogOpen,
  isAddToGroupDialogOpen,
  isBulkDeleteDialogOpen,
  isBulkLoading,
} = bulkActions;

// Group detail dialog
const isGroupDialogOpen = ref(false);
const groupDialogKey = ref(0);
const groupDialogId = ref<string | undefined>();

const handleGroupRowClick = (groupId: string) => {
  groupDialogId.value = groupId;
  groupDialogKey.value++;
  isGroupDialogOpen.value = true;
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
      :is-loading="isBulkLoading"
      :has-external-selected="hasExternalSelected"
      @cancel="clearSelection"
      @edit="isBulkEditDialogOpen = true"
      @delete="isBulkDeleteDialogOpen = true"
      @create-group="isCreateGroupDialogOpen = true"
      @add-to-group="isAddToGroupDialogOpen = true"
      @select-all="handleSelectAllToggle"
    />

    <!-- Bulk edit / group / delete dialogs -->
    <BulkActionDialogs :actions="bulkActions" />

    <!-- Reusable row template: renders a group row or a transaction row with leading/trailing slots -->
    <DefineRowTemplate v-slot="{ item, index }">
      <TransactionGroupRecord v-if="isGroupRow(item)" :group="item" @click="handleGroupRowClick" />

      <div v-else class="flex items-center gap-1">
        <slot name="row-leading" :tx="item as TransactionModel" />
        <div class="min-w-0 flex-1">
          <TransactionRecord
            :tx="item as TransactionModel"
            :show-checkbox="enableBulkEdit"
            :is-selected="isTransactionSelected((item as TransactionModel).id)"
            :is-selectable="isTransactionSelectable(item as TransactionModel)"
            :unselectable-reason="getUnselectableReason(item as TransactionModel)"
            :index="index"
            @record-click="handleRecordClick"
            @selection-change="toggleTransaction"
          />
        </div>
        <slot name="row-trailing" :tx="item as TransactionModel" />
      </div>
    </DefineRowTemplate>

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
              <UseRowTemplate
                v-if="displayTransactions[virtualRow.index]"
                :item="displayTransactions[virtualRow.index]!"
                :index="virtualRow.index"
              />
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
          <UseRowTemplate :item="item" :index="index" />
        </template>
      </div>
    </template>

    <TransactionDetailsModal v-model:open="isDialogVisible" :mobile="isMobile" :is-compact="isCompactDialog">
      <ManageTransactionDialogContent v-bind="dialogProps" @close-modal="closeDialog" />
    </TransactionDetailsModal>

    <!-- Group detail dialog -->
    <TransactionGroupDialog v-model:open="isGroupDialogOpen" :key="groupDialogKey" :group-id="groupDialogId" />

    <!-- Dedicated loan-payment dialog: opens for transfer_to_loan rows -->
    <LoanPaymentDialog
      v-if="loanDialogProps.loanAccount"
      :open="isLoanDialogVisible"
      :loan-account="loanDialogProps.loanAccount"
      :transaction="loanDialogProps.transaction"
      :opposite-transaction="loanDialogProps.oppositeTransaction"
      @update:open="(value) => !value && closeLoanDialog()"
    />
  </div>
</template>
