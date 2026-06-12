import { createTransaction } from '@/api';
import { OUT_OF_WALLET_ACCOUNT_MOCK } from '@/common/const';
import {
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  type RecordId,
  // TransactionModel,
} from '@bt/shared/types';
import type { SplitInput } from '@bt/shared/types/endpoints';

import { getTxTypeFromFormType } from '../helpers';
import { type FormSplit, UI_FORM_STRUCT } from '../types';

/**
 * Converts form splits to API split format
 */
const formSplitsToApiSplits = (splits: FormSplit[] | undefined): SplitInput[] | undefined => {
  if (!splits || splits.length === 0) return undefined;

  return splits
    .filter((split) => split.category && split.amount !== null && split.amount > 0)
    .map((split) => ({
      categoryId: split.category!.id,
      amount: split.amount as number,
      note: split.note || undefined,
    }));
};

export const prepareTxCreationParams = ({
  form,
  isTransferTx,
  isCurrenciesDifferent,
  // linkedTransaction,
}: {
  form: UI_FORM_STRUCT;
  // linkedTransaction: TransactionModel;
  isTransferTx: boolean;
  isCurrenciesDifferent: boolean;
}) => {
  const { amount, note, time, type: formTxType, paymentType, account, toAccount, category } = form;

  const accountId = account!.id;

  const creationParams: Parameters<typeof createTransaction>[0] = {
    amount: amount!,
    note,
    time: time.toUTCString(),
    transactionType: getTxTypeFromFormType(formTxType),
    paymentType: paymentType!.value,
    accountId,
    // Always send the array, even empty: an explicit `tagIds` tells the
    // backend the client already computed the final tag set (payee tags are
    // applied client-side in this form), so it must not auto-apply the
    // payee's default tags on top. Omitting it would re-add tags the user
    // deliberately deselected.
    tagIds: form.tagIds ?? [],
  };

  if (form.refundsTx) {
    creationParams.refundForTxId = form.refundsTx.transaction.id;
    if (form.refundsTx.splitId) {
      creationParams.refundForSplitId = form.refundsTx.splitId as RecordId;
    }
  }

  // if (linkedTransaction) {
  //   creationParams.destinationTransactionId = linkedTransaction.id;
  //   creationParams.transferNature = TRANSACTION_TRANSFER_NATURE.common_transfer;
  //   // TODO: also take care about the case when user is filling a form for
  //   // "target amount" and "target account" and linking exactly to them
  // } else {
  // // everything that is below...
  if (isTransferTx) {
    creationParams.destinationAccountId = toAccount!.id;
    creationParams.destinationAmount = isCurrenciesDifferent ? form.targetAmount! : amount!;
    creationParams.transferNature = TRANSACTION_TRANSFER_NATURE.common_transfer;
  } else {
    creationParams.categoryId = category.id;

    // Add splits for non-transfer transactions
    const apiSplits = formSplitsToApiSplits(form.splits);
    if (apiSplits && apiSplits.length > 0) {
      creationParams.splits = apiSplits;
    }

    // Manual Payee assignment from the dialog also locks the row server-side
    // so future provider syncs leave it alone.
    if (form.payeeId !== undefined && form.payeeId !== null) {
      creationParams.payeeId = form.payeeId as RecordId;
      creationParams.payeeLocked = true;
    }
  }

  // Handle transfer_out_wallet
  // Always send amount+accountId and never destination data
  if ([creationParams.accountId, creationParams.destinationAccountId].includes(OUT_OF_WALLET_ACCOUNT_MOCK.id)) {
    creationParams.transferNature = TRANSACTION_TRANSFER_NATURE.transfer_out_wallet;

    if (creationParams.accountId === OUT_OF_WALLET_ACCOUNT_MOCK.id) {
      creationParams.transactionType = TRANSACTION_TYPES.income;
      creationParams.amount = creationParams.destinationAmount!;
      creationParams.accountId = creationParams.destinationAccountId!;
      delete creationParams.destinationAmount;
      delete creationParams.destinationAccountId;
    } else if (creationParams.destinationAccountId === OUT_OF_WALLET_ACCOUNT_MOCK.id) {
      creationParams.transactionType = TRANSACTION_TYPES.expense;
      delete creationParams.destinationAmount;
      delete creationParams.destinationAccountId;
    }
  }

  return creationParams;
};
