<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import TransactionRecrod from '@/components/transactions-list/transaction-record.vue';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { XIcon } from 'lucide-vue-next';
import { computed } from 'vue';

import { RefundedByAnotherTxs, RefundsAnoterTx } from '../../types';
import MarkAsRefundDialog from './mark-as-refund-dialog.vue';

const props = defineProps<{
  transactionId: number | undefined;
  transactionType: TRANSACTION_TYPES;
  refunds: RefundsAnoterTx;
  refundedBy: RefundedByAnotherTxs;
  disabled?: boolean;
  isThereOriginalRefunds: boolean;
  isRecordCreation: boolean;
}>();

const emit = defineEmits<{
  'update:refunds': [value: RefundsAnoterTx];
  'update:refundedBy': [value: RefundedByAnotherTxs];
}>();

const emptyField = () => {
  emit('update:refunds', props.isThereOriginalRefunds && props.refunds ? null : undefined);
  emit('update:refundedBy', props.isThereOriginalRefunds && props.refundedBy ? null : undefined);
};

const refundTransactions = computed(() => {
  if (props.refunds) return [props.refunds];
  if (props.refundedBy) return props.refundedBy;
  return [];
});
</script>

<template>
  <template v-if="refunds || refundedBy">
    <p class="text-sm">Linked refunds</p>
    <div class="flex gap-2 items-start justify-between">
      <div class="grid gap-1 w-full">
        <template v-for="tx of refundTransactions" :key="tx.id">
          <TransactionRecrod :tx="tx" />
        </template>
      </div>

      <Button variant="default" size="icon" :disabled="disabled" class="flex-shrink-0" @click="emptyField">
        <XIcon />
      </Button>
    </div>
  </template>
  <template v-else>
    <MarkAsRefundDialog
      :key="transactionType"
      :refunds="refunds"
      :refunded-by="refundedBy"
      :transaction-type="transactionType"
      :disabled="disabled"
      :is-record-creation="isRecordCreation"
      @update:refunds="emit('update:refunds', $event)"
      @update:refunded-by="emit('update:refundedBy', $event)"
    />
  </template>
</template>
