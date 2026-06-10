import { useAccountsStore } from '@/stores';
import {
  isTwoLegTransfer,
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  AccountModel,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TransactionModel,
} from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

interface DialogProps {
  transaction: TransactionModel | undefined;
  oppositeTransaction: TransactionModel | undefined;
}

interface LoanDialogProps {
  loanAccount: AccountModel | undefined;
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

  // Loan payments get their own simplified dialog (no note/tags/payment-type/
  // link section). The same click handler routes here when the clicked tx is
  // a `transfer_to_loan` two-leg pair — both legs are required to populate the
  // edit form (source-side amount + loan-side amount for currency mismatch).
  const isLoanDialogVisible = ref(false);
  const loanDialogProps = ref<LoanDialogProps>({
    loanAccount: undefined,
    transaction: undefined,
    oppositeTransaction: undefined,
  });

  const isCompactDialog = computed(() =>
    [TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio, TRANSACTION_TRANSFER_NATURE.transfer_to_venture].includes(
      dialogProps.value.transaction?.transferNature as TRANSACTION_TRANSFER_NATURE,
    ),
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

  // Route a clicked transfer_to_loan pair to the dedicated loan dialog. We
  // need both legs — the loan-side (income) leg names the loan account, the
  // source-side (expense) leg carries the user's bank account and the amount
  // they entered. If the opposite leg hasn't loaded yet, fall back to the
  // regular dialog rather than opening a half-populated form.
  const tryRouteToLoanDialog = (baseTx: TransactionModel, oppositeTx: TransactionModel | undefined): boolean => {
    if (baseTx.transferNature !== TRANSACTION_TRANSFER_NATURE.transfer_to_loan) return false;
    if (!oppositeTx) return false;

    const sourceTx = baseTx.transactionType === TRANSACTION_TYPES.expense ? baseTx : oppositeTx;
    const loanTx = baseTx.transactionType === TRANSACTION_TYPES.income ? baseTx : oppositeTx;
    const loanAccount = accountsRecord.value[loanTx.accountId];
    if (!loanAccount || loanAccount.accountCategory !== ACCOUNT_CATEGORIES.loan) return false;

    loanDialogProps.value = {
      loanAccount,
      transaction: sourceTx,
      oppositeTransaction: loanTx,
    };
    isLoanDialogVisible.value = true;
    return true;
  };

  const handleRecordClick = ([baseTx, oppositeTx]: [
    baseTx: TransactionModel,
    oppositeTx: TransactionModel | undefined,
  ]) => {
    if (tryRouteToLoanDialog(baseTx, oppositeTx)) return;

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
    } else if (isTwoLegTransfer(baseTx.transferNature)) {
      const isValid = baseTx.transactionType === TRANSACTION_TYPES.expense;

      // Swap only when the opposite half is available. Otherwise the dialog
      // would open with transaction=undefined while still carrying an
      // oppositeTransaction, putting the form in "creation mode" with stale
      // linking state that the unlink path can't handle.
      if (isValid || oppositeTx) {
        modalOptions.transaction = isValid ? baseTx : oppositeTx;
        modalOptions.oppositeTransaction = isValid ? oppositeTx : baseTx;
      }
    }

    isDialogVisible.value = true;
    dialogProps.value = modalOptions;
  };

  const closeDialog = () => {
    isDialogVisible.value = false;
  };

  const closeLoanDialog = () => {
    isLoanDialogVisible.value = false;
  };

  return {
    isDialogVisible,
    dialogProps,
    isCompactDialog,
    handleRecordClick,
    closeDialog,
    isLoanDialogVisible,
    loanDialogProps,
    closeLoanDialog,
  };
}
