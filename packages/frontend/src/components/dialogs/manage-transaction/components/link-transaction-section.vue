<script lang="ts" setup>
import { Button } from '@/components/lib/ui/button';
import * as Dialog from '@/components/lib/ui/dialog';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { TRANSACTION_TYPES, type TransactionModel } from '@bt/shared/types';
import { computed } from 'vue';

import RecordList from '../record-list.vue';
import FormRow from './form-row.vue';

interface Props {
  isTransferTx: boolean;
  isFormCreation: boolean;
  oppositeTransaction?: TransactionModel;
  transactionType?: TRANSACTION_TYPES;
  disabled: boolean;
}

const props = defineProps<Props>();

defineEmits<{
  unlink: [];
}>();

const linkedTransaction = defineModel<TransactionModel | null>('linkedTransaction');

const oppositeTransactionType = computed(() =>
  props.transactionType === TRANSACTION_TYPES.expense ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
);

const showLinkButton = computed(
  () => props.isTransferTx && !linkedTransaction.value && !props.isFormCreation && !props.oppositeTransaction,
);

const showUnlinkButton = computed(() => props.isTransferTx && props.oppositeTransaction);

const showLinkedTransaction = computed(() => linkedTransaction.value && props.isTransferTx && !props.isFormCreation);

const clearLinkedTransaction = () => {
  linkedTransaction.value = null;
};
</script>

<template>
  <template v-if="showLinkButton">
    <FormRow>
      <Dialog.Dialog>
        <Dialog.DialogTrigger>
          <Button class="w-full" :disabled="disabled" size="sm">Link existing transaction</Button>
        </Dialog.DialogTrigger>

        <Dialog.DialogContent class="max-h-[80dvh] overflow-y-auto">
          <Dialog.DialogTitle class="sr-only">Link existing transaction</Dialog.DialogTitle>
          <Dialog.DialogDescription class="sr-only"> Link existing transaction </Dialog.DialogDescription>
          <RecordList :transaction-type="oppositeTransactionType" @select="linkedTransaction = $event" />
        </Dialog.DialogContent>
      </Dialog.Dialog>
    </FormRow>
  </template>

  <template v-if="showUnlinkButton">
    <FormRow>
      <Button class="w-full" :disabled="disabled" size="sm" @click="$emit('unlink')"> Unlink transactions </Button>
    </FormRow>
  </template>

  <template v-if="showLinkedTransaction">
    <FormRow class="flex items-center gap-2.5">
      <TransactionRecord class="bg-background" :tx="linkedTransaction!" />

      <Button aria-label="Cancel linking" :disabled="disabled" size="sm" @click="clearLinkedTransaction">
        Cancel
      </Button>
    </FormRow>
  </template>
</template>
