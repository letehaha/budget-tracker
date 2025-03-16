<template>
  <div class="type-selector">
    <button
      type="button"
      class="button-style-reset type-selector__item"
      :disabled="disabled || isExpenseDisabled"
      :class="{
        'type-selector__item--active': selectedTransactionType === FORM_TYPES.expense,
      }"
      aria-label="Select expense"
      :aria-selected="selectedTransactionType === FORM_TYPES.expense"
      @click="selectTransactionType(FORM_TYPES.expense)"
    >
      Expense
    </button>
    <button
      type="button"
      class="button-style-reset type-selector__item"
      :disabled="disabled || isIncomeDisabled"
      :class="{
        'type-selector__item--active': selectedTransactionType === FORM_TYPES.income,
      }"
      aria-label="Select income"
      :aria-selected="selectedTransactionType === FORM_TYPES.income"
      @click="selectTransactionType(FORM_TYPES.income)"
    >
      Income
    </button>
    <button
      type="button"
      class="button-style-reset type-selector__item"
      :disabled="disabled"
      :class="{
        'type-selector__item--active': selectedTransactionType === FORM_TYPES.transfer,
      }"
      aria-label="Select transfer"
      :aria-selected="selectedTransactionType === FORM_TYPES.transfer"
      @click="selectTransactionType(FORM_TYPES.transfer)"
    >
      Transfer
    </button>
  </div>
</template>

<script setup lang="ts">
import { ACCOUNT_TYPES, TRANSACTION_TYPES, type TransactionModel } from '@bt/shared/types';
import { computed } from 'vue';

import { FORM_TYPES } from '../types';

const props = defineProps<{
  selectedTransactionType: FORM_TYPES;
  isFormCreation: boolean;
  transaction?: TransactionModel;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'change-tx-type': [value: FORM_TYPES];
}>();

const isExpenseDisabled = computed(
  () =>
    props.transaction?.accountType !== ACCOUNT_TYPES.system &&
    props.transaction?.transactionType === TRANSACTION_TYPES.income,
);
const isIncomeDisabled = computed(
  () =>
    props.transaction?.accountType !== ACCOUNT_TYPES.system &&
    props.transaction?.transactionType === TRANSACTION_TYPES.expense,
);

const selectTransactionType = (type: FORM_TYPES) => {
  emit('change-tx-type', type);
};
</script>

<style lang="scss">
.type-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));

  background-color: rgba(#000, 0.4);
  border-radius: 12px;
}
.type-selector__item {
  padding: 6px;

  font-size: 16px;
  text-align: center;
  cursor: pointer;

  transition: 0.1s ease-out;
  color: #fff;

  &[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.type-selector__item--active {
  background-color: #fff;
  border-radius: 10px;
  color: #000;
}
</style>
