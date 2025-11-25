<template>
  <div class="grid grid-cols-3 rounded-xl bg-black/40">
    <button
      type="button"
      :class="
        cn(
          'cursor-pointer p-1.5 text-center text-base text-white transition-all duration-100 ease-out disabled:cursor-not-allowed disabled:opacity-50',
          selectedTransactionType === FORM_TYPES.expense && 'rounded-[10px] bg-white text-black',
        )
      "
      :disabled="disabled || isExpenseDisabled"
      aria-label="Select expense"
      :aria-selected="selectedTransactionType === FORM_TYPES.expense"
      @click="selectTransactionType(FORM_TYPES.expense)"
    >
      Expense
    </button>
    <button
      type="button"
      :class="
        cn(
          'cursor-pointer p-1.5 text-center text-base text-white transition-all duration-100 ease-out disabled:cursor-not-allowed disabled:opacity-50',
          selectedTransactionType === FORM_TYPES.income && 'rounded-[10px] bg-white text-black',
        )
      "
      :disabled="disabled || isIncomeDisabled"
      aria-label="Select income"
      :aria-selected="selectedTransactionType === FORM_TYPES.income"
      @click="selectTransactionType(FORM_TYPES.income)"
    >
      Income
    </button>
    <button
      type="button"
      :class="
        cn(
          'cursor-pointer p-1.5 text-center text-base text-white transition-all duration-100 ease-out disabled:cursor-not-allowed disabled:opacity-50',
          selectedTransactionType === FORM_TYPES.transfer && 'rounded-[10px] bg-white text-black',
        )
      "
      :disabled="disabled"
      aria-label="Select transfer"
      :aria-selected="selectedTransactionType === FORM_TYPES.transfer"
      @click="selectTransactionType(FORM_TYPES.transfer)"
    >
      Transfer
    </button>
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';
import { ACCOUNT_TYPES, type AccountModel, TRANSACTION_TYPES, type TransactionModel } from '@bt/shared/types';
import { computed } from 'vue';

import { FORM_TYPES } from '../types';

const props = defineProps<{
  selectedTransactionType: FORM_TYPES;
  isFormCreation: boolean;
  transaction?: TransactionModel;
  account?: AccountModel;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'change-tx-type': [value: FORM_TYPES];
}>();

// Check the account type, not the transaction type
// A system transaction in a monobank account should not be editable
const isExpenseDisabled = computed(
  () => props.account?.type !== ACCOUNT_TYPES.system && props.transaction?.transactionType === TRANSACTION_TYPES.income,
);
const isIncomeDisabled = computed(
  () =>
    props.account?.type !== ACCOUNT_TYPES.system && props.transaction?.transactionType === TRANSACTION_TYPES.expense,
);

const selectTransactionType = (type: FORM_TYPES) => {
  emit('change-tx-type', type);
};
</script>
