<script lang="ts" setup>
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
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

const props = withDefaults(
  defineProps<{
    transactions: TransactionModel[];
    isTransactionRecord?: boolean;
    isTransactionPicking?: boolean;
  }>(),
  {
    isTransactionRecord: false,
    isTransactionPicking: false,
  },
);
const [UseDialogTemplate, SlotContent] = createReusableTemplate();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);
const pickedTransactions = ref<number[]>([]);
const emits = defineEmits<{
  (e: 'update:pickedTransactions', value: number[]): void;
}>();

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

  if (!props.isTransactionPicking) {
    isDialogVisible.value = true;
    dialogProps.value = modalOptions;
  }
};

const toggleChecked = (value: boolean, item: TransactionModel) => {
  const transactionId = item.id;
  if (value) {
    if (!pickedTransactions.value.includes(transactionId)) {
      pickedTransactions.value.push(transactionId);
    }
  } else {
    pickedTransactions.value = pickedTransactions.value.filter((id) => id !== transactionId);
  }
  emits('update:pickedTransactions', pickedTransactions.value);
};
</script>

<template>
  <div>
    <div v-bind="$attrs" class="grid grid-cols-1 gap-2">
      <template
        v-for="item in transactions"
        :key="`${item.id}-${item.categoryId}-${item.refAmount}-${item.note}-${item.time}`"
      >
        <div class="flex items-center">
          <Checkbox
            v-if="isTransactionPicking"
            :checked="pickedTransactions.includes(item.id)"
            @update:checked="toggleChecked($event, item)"
          />
          <TransactionRecord :tx="item" @record-click="handlerRecordClick" />
        </div>
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
        <Dialog.DialogContent custom-close class="bg-card max-h-[90dvh] w-full max-w-[900px] p-0">
          <Dialog.DialogDescription></Dialog.DialogDescription>
          <SlotContent />
        </Dialog.DialogContent>
      </Dialog.Dialog>
    </template>
  </div>
</template>
