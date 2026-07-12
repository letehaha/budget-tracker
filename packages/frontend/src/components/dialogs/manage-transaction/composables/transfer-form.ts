import { OUT_OF_WALLET_ACCOUNT_MOCK } from '@/common/const';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { Ref, computed, watch } from 'vue';

import { UI_FORM_STRUCT } from '../types';

export type TransferDestinationType = 'account' | 'portfolio' | 'loan';

export const useTransferFormLogic = ({
  form,
  isTransferTx,
  isRecordExternal,
  isOppositeTxExternal,
  transaction,
  oppositeTransaction,
  linkedTransaction,
  transferDestinationType,
}: {
  form: Ref<UI_FORM_STRUCT>;
  isTransferTx: Ref<boolean>;
  isRecordExternal: Ref<boolean>;
  isOppositeTxExternal: Ref<boolean>;
  transaction: TransactionModel | undefined;
  oppositeTransaction: TransactionModel | undefined;
  linkedTransaction: Ref<TransactionModel | null>;
  transferDestinationType: Ref<TransferDestinationType>;
}) => {
  const { currenciesMap } = storeToRefs(useCurrenciesStore());
  // Vehicle accounts can't be a transfer source or destination — the backend
  // rejects transfers touching them, so keep them out of both pickers.
  // Loans can be a transfer destination (transfer_to_loan) but never a source —
  // money only flows in — so the source list uses the loan-excluded variant.
  const { txTargetableAccountsActiveFirst, txTargetableSourceAccountsActiveFirst } = storeToRefs(useAccountsStore());

  const toAccount = computed(() => form.value.toAccount);

  const isTargetFieldVisible = computed(() => {
    if (isTransferTx.value && linkedTransaction.value) return false;
    if (transferDestinationType.value === 'portfolio') return false;
    // A loan payment posts in the loan's currency — cross-currency needs the user
    // to enter the loan-side amount too, or the payload has no destination amount.
    if (transferDestinationType.value === 'loan') {
      const sourceCode = form.value.account?.currencyCode;
      const loanCode = form.value.toAccount?.currencyCode;
      return Boolean(isTransferTx.value && sourceCode && loanCode && sourceCode !== loanCode);
    }
    return isTransferTx.value;
  });

  const isTargetAmountFieldDisabled = computed(() => {
    if (isRecordExternal.value) {
      if (!isTransferTx.value) return true;
      if (transaction?.transactionType === TRANSACTION_TYPES.income) return true;
    }
    if (isOppositeTxExternal.value) {
      if (oppositeTransaction?.transactionType === TRANSACTION_TYPES.income) return true;
    }
    // Means it's "Out of wallet"
    if (toAccount.value?.id === OUT_OF_WALLET_ACCOUNT_MOCK.id) return true;
    if (isTransferTx.value && linkedTransaction.value) return true;
    return false;
  });

  const targetCurrency = computed(() =>
    form.value.toAccount?.currencyCode ? currenciesMap.value[form.value.toAccount.currencyCode] : undefined,
  );

  const fromAccountFieldDisabled = computed(() => {
    if (isRecordExternal.value) {
      if (!isTransferTx.value) return true;
      if (transaction?.transactionType === TRANSACTION_TYPES.expense) return true;
    }
    if (isTransferTx.value && linkedTransaction.value) return true;
    return false;
  });

  const toAccountFieldDisabled = computed(() => {
    if (isRecordExternal.value) {
      if (!isTransferTx.value) return true;
      if (transaction?.transactionType === TRANSACTION_TYPES.income) return true;
    }
    if (isOppositeTxExternal.value) {
      if (oppositeTransaction?.transactionType === TRANSACTION_TYPES.income) return true;
    }
    if (isTransferTx.value && linkedTransaction.value) return true;
    return false;
  });

  const transferSourceAccounts = computed(() => [
    OUT_OF_WALLET_ACCOUNT_MOCK,
    ...txTargetableSourceAccountsActiveFirst.value,
  ]);

  const transferDestinationAccounts = computed(() =>
    [OUT_OF_WALLET_ACCOUNT_MOCK, ...txTargetableAccountsActiveFirst.value].filter(
      (item) => item.id !== form.value.account?.id,
    ),
  );

  watch(
    () => form.value.account,
    (value) => {
      // If fromAccount is the same as toAccount, make toAccount empty
      if (form.value.toAccount?.id === value?.id) {
        // eslint-disable-next-line no-param-reassign
        form.value.toAccount = undefined;
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
