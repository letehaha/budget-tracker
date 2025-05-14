<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import * as Dialog from '@/components/lib/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/lib/ui/radio-group';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { computed, reactive, ref, watch } from 'vue';

import { RefundedByAnotherTxs, RefundsAnoterTx } from '../../types';
import MarkAsRefundInfoPopover from './mark-as-refund-info-popover.vue';
import RecordsList from './refund-records-list.vue';

const props = defineProps<{
  transactionType: TRANSACTION_TYPES;
  disabled?: boolean;
  isRecordCreation: boolean;
  refunds: RefundsAnoterTx;
  refundedBy: RefundedByAnotherTxs;
}>();

const emit = defineEmits<{
  'update:refunds': [value: RefundsAnoterTx];
  'update:refundedBy': [value: RefundedByAnotherTxs];
}>();

const selectionState = reactive<{
  refunds: RefundsAnoterTx;
  refundedBy: RefundedByAnotherTxs;
}>({
  refunds: undefined,
  refundedBy: undefined,
});

const isSaveDisabled = computed(() => selectionState.refunds === undefined && selectionState.refundedBy === undefined);

const isDialogOpen = ref(false);

const selectedOption = ref<'refunds' | 'refunded'>('refunds');

watch(selectedOption, () => {
  selectionState.refunds = undefined;
  selectionState.refundedBy = undefined;
});

const onSelectValue = (v: TransactionModel) => {
  if (selectedOption.value === 'refunds') {
    selectionState.refunds = props.refunds?.id === v.id ? undefined : v;
    selectionState.refundedBy = undefined;
  } else if (selectedOption.value === 'refunded') {
    const existingValues = Array.isArray(selectionState.refundedBy) ? selectionState.refundedBy : [];

    if (existingValues.map((i) => i.id).includes(v.id)) {
      selectionState.refundedBy = existingValues.filter((i) => i.id !== v.id);
    } else {
      selectionState.refundedBy = [...existingValues, v];
    }
    selectionState.refunds = undefined;
  }
};
const selectedTransactions = computed(() => {
  if (selectionState.refunds) return [selectionState.refunds];
  if (selectionState.refundedBy) return selectionState.refundedBy;
  return [];
});
const saveState = () => {
  if (selectionState.refunds !== undefined) {
    emit('update:refunds', selectionState.refunds);
  } else if (selectionState.refundedBy !== undefined) {
    emit('update:refundedBy', selectionState.refundedBy);
  }
};
</script>

<template>
  <div>
    <Dialog.Dialog v-model:open="isDialogOpen">
      <Dialog.DialogTrigger as-child>
        <Button class="w-full" :disabled="disabled" variant="secondary"> Link refund </Button>
      </Dialog.DialogTrigger>
      <Dialog.DialogContent class="grid max-h-[90dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto]">
        <Dialog.DialogHeader class="mb-4">
          <Dialog.DialogTitle>Select transaction</Dialog.DialogTitle>
          <Dialog.DialogDescription>
            <template v-if="selectedOption === 'refunds'">
              <span> Select the original transaction that this entry is refunding. </span>
            </template>
            <template v-else-if="selectedOption === 'refunded'">
              <span> Select transactions which refund current entry. </span>
            </template>

            <MarkAsRefundInfoPopover />
          </Dialog.DialogDescription>
        </Dialog.DialogHeader>

        <div class="mb-4 grid gap-2">
          <div class="flex items-center justify-between">
            <RadioGroup v-model="selectedOption" default-value="refunds" class="flex gap-6">
              <label class="flex cursor-pointer items-center gap-2">
                <RadioGroupItem value="refunds" />
                <p class="text-sm">Refunds</p>
              </label>
              <label
                :class="['flex cursor-pointer items-center gap-2', isRecordCreation && 'cursor-not-allowed opacity-70']"
              >
                <RadioGroupItem :disabled="isRecordCreation" value="refunded" />
                <p class="text-sm">Refunded by</p>
              </label>
            </RadioGroup>

            <Button :disabled="isSaveDisabled" @click="saveState"> Save </Button>
          </div>

          <template v-if="selectedOption === 'refunds'">
            <p class="text-xs text-white opacity-70">* you can select only one transaction</p>
          </template>
          <template v-else-if="selectedOption === 'refunded'">
            <p class="text-xs text-white opacity-70">
              * you can select multiple transactions, but their total amount cannot be greater than the original
              transaction amount
            </p>
          </template>
        </div>

        <RecordsList
          :transaction-type="transactionType"
          :on-select="onSelectValue"
          :selected-transactions="selectedTransactions"
          class="my-2"
        />
      </Dialog.DialogContent>
    </Dialog.Dialog>
  </div>
</template>
