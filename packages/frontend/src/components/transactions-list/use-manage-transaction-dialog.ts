import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
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
  const isDialogVisible = ref(false);
  const dialogProps = ref<DialogProps>({
    transaction: undefined,
    oppositeTransaction: undefined,
  });

  const isCompactDialog = computed(
    () => dialogProps.value.transaction?.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
  );

  const handleRecordClick = ([baseTx, oppositeTx]: [
    baseTx: TransactionModel,
    oppositeTx: TransactionModel | undefined,
  ]) => {
    const isExternalTransfer =
      baseTx.accountType !== ACCOUNT_TYPES.system || (oppositeTx && oppositeTx.accountType !== ACCOUNT_TYPES.system);

    const modalOptions: DialogProps = {
      transaction: baseTx,
      oppositeTransaction: undefined,
    };

    if (isExternalTransfer) {
      const isBaseExternal = baseTx.accountType !== ACCOUNT_TYPES.system;

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
