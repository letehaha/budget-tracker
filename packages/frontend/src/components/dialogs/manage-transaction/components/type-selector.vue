<template>
  <div class="bg-muted grid grid-cols-3 rounded-xl p-1">
    <button
      type="button"
      :class="
        cn(
          'text-muted-foreground cursor-pointer rounded-[10px] p-1.5 text-center text-base transition-all duration-100 ease-out disabled:cursor-not-allowed disabled:opacity-50',
          selectedTransactionType === FORM_TYPES.expense &&
            'dark:bg-foreground dark:text-background text-foreground bg-white shadow-sm',
        )
      "
      :disabled="disabled || isExpenseDisabled"
      :aria-label="t('dialogs.manageTransaction.typeSelector.selectExpense')"
      :aria-selected="selectedTransactionType === FORM_TYPES.expense"
      @click="selectTransactionType(FORM_TYPES.expense)"
    >
      {{ t('dialogs.manageTransaction.typeSelector.expense') }}
    </button>
    <button
      type="button"
      :class="
        cn(
          'text-muted-foreground cursor-pointer rounded-[10px] p-1.5 text-center text-base transition-all duration-100 ease-out disabled:cursor-not-allowed disabled:opacity-50',
          selectedTransactionType === FORM_TYPES.income &&
            'dark:bg-foreground dark:text-background text-foreground bg-white shadow-sm',
        )
      "
      :disabled="disabled || isIncomeDisabled"
      :aria-label="t('dialogs.manageTransaction.typeSelector.selectIncome')"
      :aria-selected="selectedTransactionType === FORM_TYPES.income"
      @click="selectTransactionType(FORM_TYPES.income)"
    >
      {{ t('dialogs.manageTransaction.typeSelector.income') }}
    </button>
    <button
      type="button"
      :class="
        cn(
          'text-muted-foreground cursor-pointer rounded-[10px] p-1.5 text-center text-base transition-all duration-100 ease-out disabled:cursor-not-allowed disabled:opacity-50',
          selectedTransactionType === FORM_TYPES.transfer &&
            'dark:bg-foreground dark:text-background text-foreground bg-white shadow-sm',
        )
      "
      :disabled="disabled"
      :aria-label="t('dialogs.manageTransaction.typeSelector.selectTransfer')"
      :aria-selected="selectedTransactionType === FORM_TYPES.transfer"
      @click="selectTransactionType(FORM_TYPES.transfer)"
    >
      {{ t('dialogs.manageTransaction.typeSelector.transfer') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';
import { ACCOUNT_TYPES, type AccountModel, TRANSACTION_TYPES, type TransactionModel } from '@bt/shared/types';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { FORM_TYPES } from '../types';

const { t } = useI18n();

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
