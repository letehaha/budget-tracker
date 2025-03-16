import { OUT_OF_WALLET_ACCOUNT_MOCK } from '@/common/const';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { Ref, computed, watch } from 'vue';

import { UI_FORM_STRUCT } from '../types';

export const useTransferFormLogic = ({
  form,
  isTransferTx,
  isRecordExternal,
  transaction,
  linkedTransaction,
}: {
  form: Ref<UI_FORM_STRUCT>;
  isTransferTx: Ref<boolean>;
  isRecordExternal: Ref<boolean>;
  transaction: TransactionModel;
  linkedTransaction: Ref<TransactionModel>;
}) => {
  const { currenciesMap } = storeToRefs(useCurrenciesStore());
  const { systemAccounts } = storeToRefs(useAccountsStore());

  const toAccount = computed(() => form.value.toAccount);

  const isTargetFieldVisible = computed(() => {
    if (isTransferTx.value && linkedTransaction.value) {
      return false;
    }
    return isTransferTx.value;
  });

  const isTargetAmountFieldDisabled = computed(() => {
    if (isRecordExternal.value) {
      if (!isTransferTx.value) return true;
      if (transaction.transactionType === TRANSACTION_TYPES.income) return true;
    }
    // Means it's "Out of wallet"
    if (toAccount.value?.id === OUT_OF_WALLET_ACCOUNT_MOCK.id) return true;
    if (isTransferTx.value && linkedTransaction.value) return true;
    return false;
  });

  const targetCurrency = computed(() => currenciesMap.value[form.value.toAccount?.currencyId]);

  const fromAccountFieldDisabled = computed(() => {
    if (isRecordExternal.value) {
      if (!isTransferTx.value) return true;
      if (transaction.transactionType === TRANSACTION_TYPES.expense) return true;
    }
    if (isTransferTx.value && linkedTransaction.value) return true;
    return false;
  });
  const toAccountFieldDisabled = computed(() => {
    if (isRecordExternal.value) {
      if (!isTransferTx.value) return true;
      if (transaction.transactionType === TRANSACTION_TYPES.income) return true;
    }
    if (isTransferTx.value && linkedTransaction.value) return true;
    return false;
  });

  const transferSourceAccounts = computed(() => [OUT_OF_WALLET_ACCOUNT_MOCK, ...systemAccounts.value]);

  const transferDestinationAccounts = computed(() =>
    transferSourceAccounts.value.filter((item) => item.id !== form.value.account?.id),
  );

  watch(
    () => form.value.account,
    (value) => {
      // If fromAccount is the same as toAccount, make toAccount empty
      if (form.value.toAccount?.id === value?.id) {
        // eslint-disable-next-line no-param-reassign
        form.value.toAccount = null;
      }
    },
  );

  return {
    isTargetFieldVisible,
    isTargetAmountFieldDisabled,
    targetCurrency,
    fromAccountFieldDisabled,
    toAccountFieldDisabled,
    transferSourceAccounts,
    transferDestinationAccounts,
  };
};
