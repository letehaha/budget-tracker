<script lang="ts" setup>
import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { createReusableTemplate } from '@vueuse/core';
import { defineAsyncComponent, ref, watch } from 'vue';

import TransactionRecord from './transaction-record.vue';

const ManageTransactionDoalogContent = defineAsyncComponent(
  () => import('@/components/dialogs/manage-transaction/dialog-content.vue'),
);

withDefaults(
  defineProps<{
    transactions: TransactionModel[];
    isTransactionRecord?: boolean;
  }>(),
  {
    isTransactionRecord: false,
  },
);
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
</script>

<template>
  <div>
    <div v-bind="$attrs" class="grid gap-2 grid-cols-1">
      <template
        v-for="item in transactions"
        :key="`${item.id}-${item.categoryId}-${item.refAmount}-${item.note}-${item.time}`"
      >
        <TransactionRecord :tx="item" @record-click="handlerRecordClick" />
      </template>
    </div>

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
        <Dialog.DialogContent custom-close class="max-h-[90dvh] w-full max-w-[900px] bg-card p-0">
          <Dialog.DialogDescription></Dialog.DialogDescription>
          <SlotContent />
        </Dialog.DialogContent>
      </Dialog.Dialog>
    </template>
  </div>
</template>
