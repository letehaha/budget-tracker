<script lang="ts" setup>
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { useScrollAreaContainer } from '@/composable/scroll-area-container';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { createReusableTemplate } from '@vueuse/core';
import { computed, defineAsyncComponent, ref, watch, watchEffect } from 'vue';

import { SCROLL_AREA_IDS } from '../lib/ui/scroll-area/types';
import TransactionRecord from './transaction-record.vue';

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
  }>(),
  {
    isTransactionRecord: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    paginate: true,
    scrollAreaId: SCROLL_AREA_IDS.dashboard,
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

const scrollContainer = useScrollAreaContainer(props.scrollAreaId);

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.transactions.length + (props.hasNextPage ? 1 : 0),
    getScrollElement: () => scrollContainer?.value?.viewportElement,
    estimateSize: () => 52 + 8,
    overscan: 10,
    enabled: props.paginate && !!scrollContainer?.value?.viewportElement,
  })),
);

defineExpose({
  virtualizer,
  scrollToIndex: (index) => virtualizer.value.scrollToIndex(index),
  scrollToOffset: (offset) => virtualizer.value.scrollToOffset(offset),
});

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

watchEffect(() => {
  const [lastItem] = [...virtualRows.value].reverse();

  if (!lastItem) return;

  if (lastItem.index >= props.transactions.length - 1 && props.hasNextPage && !props.isFetchingNextPage) {
    emits('fetch-next-page');
  }
});
</script>

<template>
  <div>
    <template v-if="paginate">
      <div class="relative">
        <div v-bind="$attrs" v-if="transactions" class="w-full">
          <div :style="{ height: `${totalSize}px` }" class="relative">
            <div
              v-for="virtualRow in virtualRows"
              :key="`${transactions[virtualRow.index].id}-${transactions[virtualRow.index].categoryId}-${transactions[virtualRow.index].refAmount}-${transactions[virtualRow.index].note}-${transactions[virtualRow.index].time}`"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }"
            >
              <template v-if="transactions[virtualRow.index]">
                <TransactionRecord :tx="transactions[virtualRow.index]" @record-click="handlerRecordClick" />
              </template>
            </div>
          </div>

          <div class="flex h-10 items-center justify-center">
            <template v-if="!hasNextPage"> No more data to load </template>
          </div>
        </div>

        <div class="absolute bottom-0 left-0 right-0 flex h-10 items-center justify-center bg-white/5 empty:hidden">
          <template v-if="isFetchingNextPage">Loading more...</template>
        </div>
      </div>
    </template>
    <template v-else>
      <div v-bind="$attrs" class="grid grid-cols-1 gap-2">
        <template
          v-for="item in transactions"
          :key="`${item.id}-${item.categoryId}-${item.refAmount}-${item.note}-${item.time}`"
        >
          <TransactionRecord :tx="item" @record-click="handlerRecordClick" />
        </template>
      </div>
    </template>

    <UseDialogTemplate>
      <ManageTransactionDoalogContent v-bind="dialogProps" @close-modal="isDialogVisible = false" />
    </UseDialogTemplate>

    <template v-if="isMobile">
      <Drawer.Drawer v-model:open="isDialogVisible">
        <Drawer.DrawerContent custom-indicator>
          <Drawer.DrawerDescription></Drawer.DrawerDescription>
          <SlotContent />
        </Drawer.DrawerContent>
      </Drawer.Drawer>
    </template>
    <template v-else>
      <Dialog.Dialog v-model:open="isDialogVisible">
        <Dialog.DialogContent custom-close class="bg-card max-h-[90dvh] w-full max-w-[900px] p-0">
          <Dialog.DialogDescription></Dialog.DialogDescription>
          <SlotContent />
        </Dialog.DialogContent>
      </Dialog.Dialog>
    </template>
  </div>
</template>
