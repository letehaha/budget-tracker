import { useAccountsStore } from '@/stores';
import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

interface DialogProps {
  transaction: TransactionModel | undefined;
  oppositeTransaction: TransactionModel | undefined;
}

/**
 * Manages the transaction detail dialog state:
 * - Open/close state
 * - Transaction + opposite transaction props (for transfers)
 * - Transfer normalization (determines which side is primary vs opposite)
 * - Compact dialog detection (for portfolio transfers)
 */
export function useManageTransactionDialog() {
  const { accountsRecord } = storeToRefs(useAccountsStore());

  const isDialogVisible = ref(false);
  const dialogProps = ref<DialogProps>({
    transaction: undefined,
    oppositeTransaction: undefined,
  });

  const isCompactDialog = computed(
    () => dialogProps.value.transaction?.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
  );

  // Derive externality from the actual account record rather than tx.accountType.
  // Transactions can carry a stale/default accountType (the create-tx API defaults
  // it to "system" when not provided), but the account's own type is authoritative.
  // Fall back to tx.accountType when the account record isn't loaded (archived
  // account, store still hydrating) — strictly better than silently classifying as
  // system, which would re-trigger the original external-transfer normalization bug.
  const isAccountExternal = (tx: TransactionModel | undefined): boolean => {
    if (!tx) return false;
    const account = accountsRecord.value[tx.accountId];
    if (account) return account.type !== ACCOUNT_TYPES.system;
    return tx.accountType !== ACCOUNT_TYPES.system;
  };

  const handleRecordClick = ([baseTx, oppositeTx]: [
    baseTx: TransactionModel,
    oppositeTx: TransactionModel | undefined,
  ]) => {
    const isBaseExternal = isAccountExternal(baseTx);
    const isOppositeExternal = isAccountExternal(oppositeTx);
    const isExternalTransfer = isBaseExternal || isOppositeExternal;

    const modalOptions: DialogProps = {
      transaction: baseTx,
      oppositeTransaction: undefined,
    };

    if (isExternalTransfer) {
      modalOptions.transaction = isBaseExternal ? baseTx : oppositeTx;
      modalOptions.oppositeTransaction = isBaseExternal ? oppositeTx : baseTx;
    } else if (baseTx.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer) {
      const isValid = baseTx.transactionType === TRANSACTION_TYPES.expense;

      modalOptions.transaction = isValid ? baseTx : oppositeTx;
      modalOptions.oppositeTransaction = isValid ? oppositeTx : baseTx;
    }

    isDialogVisible.value = true;
    dialogProps.value = modalOptions;
  };

  const closeDialog = () => {
    isDialogVisible.value = false;
  };

  return {
    isDialogVisible,
    dialogProps,
    isCompactDialog,
    handleRecordClick,
    closeDialog,
  };
}
