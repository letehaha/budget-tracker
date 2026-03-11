<script lang="ts" setup>
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { useScrollAreaContainer } from '@/composable/scroll-area-container';
import { useTransactionSelection } from '@/composable/transaction-selection';
import { useBulkUpdateCategory } from '@/composable/use-bulk-update-category';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { TransactionModel } from '@bt/shared/types';
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
import { useManageTransactionDialog } from './use-manage-transaction-dialog';
import { getDisplayItemKey, isGroupRow, useTransactionsDisplay } from './use-transactions-display';

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

// Transaction detail dialog (Dialog on desktop, Drawer on mobile)
const { isDialogVisible, dialogProps, isCompactDialog, handleRecordClick, closeDialog } = useManageTransactionDialog();

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

    <UseDialogTemplate>
      <ManageTransactionDialogContent v-bind="dialogProps" @close-modal="closeDialog" />
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
