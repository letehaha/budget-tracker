import { editTransaction } from '@/api';
import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import type { SplitInput } from '@bt/shared/types/endpoints';

import { getDestinationAccount, getDestinationAmount, getTxTypeFromFormType, isOutOfWalletAccount } from '../helpers';
import { type FormSplit, UI_FORM_STRUCT } from '../types';

/**
 * Converts form splits to API split format for updates.
 * Returns null to clear all splits, undefined to leave unchanged, or array of splits.
 */
const formSplitsToApiSplits = ({
  formSplits,
  originalHadSplits,
}: {
  formSplits: FormSplit[] | undefined;
  originalHadSplits: boolean;
}): SplitInput[] | null | undefined => {
  // No splits in form
  if (!formSplits || formSplits.length === 0) {
    // If original had splits and now there are none, send null to clear
    return originalHadSplits ? null : undefined;
  }

  // Filter and convert valid splits
  const validSplits = formSplits
    .filter((split) => split.category && split.amount !== null && split.amount > 0)
    .map((split) => ({
      categoryId: split.category!.id,
      amount: split.amount as number,
      note: split.note || undefined,
    }));

  // If we had splits but all were invalid, clear them
  if (validSplits.length === 0) {
    return originalHadSplits ? null : undefined;
  }

  return validSplits;
};

export const prepareTxUpdationParams = ({
  form,
  transaction,
  linkedTransaction,
  isTransferTx,
  isRecordExternal,
  isCurrenciesDifferent,
  isOriginalRefundsOverriden,
}: {
  transaction: TransactionModel;
  linkedTransaction?: TransactionModel | null;
  form: UI_FORM_STRUCT;
  isTransferTx: boolean;
  isRecordExternal: boolean;
  isCurrenciesDifferent: boolean;
  isOriginalRefundsOverriden: boolean;
}) => {
  const { amount, note, time, type: formTxType, paymentType, account, category } = form;

  const accountId = account?.id ?? undefined;

  let editionParams: Parameters<typeof editTransaction>[0] = {
    txId: transaction.id,
  };

  if (isOriginalRefundsOverriden) {
    // Make sure that only one non-nullish field is being sent to the API
    if (form.refundsTx && form.refundedByTxs === null) {
      editionParams.refundsTxId = form.refundsTx ? form.refundsTx.transaction.id : null;
      editionParams.refundsSplitId = form.refundsTx?.splitId ?? null;
    } else if (form.refundsTx === null && form.refundedByTxs) {
      editionParams.refundedByTxIds = form.refundedByTxs ? form.refundedByTxs.map((i) => i.transaction.id) : null;
      // Build splitId mapping for refunded-by transactions
      if (form.refundedByTxs) {
        const splitMapping: Record<number, string> = {};
        form.refundedByTxs.forEach((r) => {
          if (r.splitId) {
            splitMapping[r.transaction.id] = r.splitId;
          }
        });
        if (Object.keys(splitMapping).length > 0) {
          editionParams.refundedBySplitIds = splitMapping;
        }
      }
    } else if (form.refundsTx === null && form.refundedByTxs === undefined) {
      editionParams.refundsTxId = null;
      editionParams.refundsSplitId = null;
    } else if (form.refundedByTxs === null && form.refundsTx === undefined) {
      editionParams.refundedByTxIds = null;
      editionParams.refundedBySplitIds = null;
    } else {
      editionParams.refundsTxId = form.refundsTx ? form.refundsTx.transaction.id : undefined;
      editionParams.refundsSplitId = form.refundsTx?.splitId ?? undefined;
      editionParams.refundedByTxIds = form.refundedByTxs ? form.refundedByTxs.map((i) => i.transaction.id) : undefined;
      // Build splitId mapping for refunded-by transactions
      if (form.refundedByTxs) {
        const splitMapping: Record<number, string> = {};
        form.refundedByTxs.forEach((r) => {
          if (r.splitId) {
            splitMapping[r.transaction.id] = r.splitId;
          }
        });
        if (Object.keys(splitMapping).length > 0) {
          editionParams.refundedBySplitIds = splitMapping;
        }
      }
    }
  }

  if (isRecordExternal) {
    editionParams = {
      ...editionParams,
      note,
      paymentType: paymentType!.value,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    };
  } else {
    editionParams = {
      ...editionParams,
      amount: Number(amount),
      note,
      time: time.toISOString(),
      transactionType: getTxTypeFromFormType(formTxType),
      paymentType: paymentType!.value,
      accountId,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    };
  }

  if (isTransferTx) {
    const destinationAccount = getDestinationAccount({
      isRecordExternal,
      account: form.account!,
      toAccount: form.toAccount!,
      sourceTransaction: transaction,
    });

    if (!linkedTransaction?.id) {
      // For out_of_wallet transactions basic logic from `getTxTypeFromFormType` doesn't really work
      // so we need to redefine it manually
      if (isOutOfWalletAccount(destinationAccount)) {
        editionParams.transferNature = TRANSACTION_TRANSFER_NATURE.transfer_out_wallet;
        // Don't set transactionType for external transactions - it's a restricted field
        if (!isRecordExternal) {
          editionParams.transactionType = TRANSACTION_TYPES.expense;
        }
      } else if (isOutOfWalletAccount(form.account!)) {
        // Don't set transactionType for external transactions - it's a restricted field
        if (!isRecordExternal) {
          editionParams.transactionType = TRANSACTION_TYPES.income;
        }
        editionParams.accountId = destinationAccount.id;
        editionParams.amount = getDestinationAmount({
          sourceTransaction: transaction,
          isRecordExternal,
          fromAmount: Number(form.amount),
          toAmount: Number(form.targetAmount),
          isCurrenciesDifferent,
        });
        editionParams.transferNature = TRANSACTION_TRANSFER_NATURE.transfer_out_wallet;
      } else {
        editionParams.destinationAccountId = destinationAccount.id;
        editionParams.destinationAmount = getDestinationAmount({
          sourceTransaction: transaction,
          isRecordExternal,
          fromAmount: Number(form.amount),
          toAmount: Number(form.targetAmount),
          isCurrenciesDifferent,
        });
        editionParams.transferNature = TRANSACTION_TRANSFER_NATURE.common_transfer;
      }
    } else {
      editionParams.destinationTransactionId = linkedTransaction.id;
      editionParams.transferNature = TRANSACTION_TRANSFER_NATURE.common_transfer;
    }

    // Clear splits when converting to transfer
    if (transaction.splits && transaction.splits.length > 0) {
      editionParams.splits = null;
    }
  } else {
    editionParams.categoryId = category.id;

    // Handle splits for non-transfer transactions
    const originalHadSplits = Boolean(transaction.splits && transaction.splits.length > 0);
    const apiSplits = formSplitsToApiSplits({
      formSplits: form.splits,
      originalHadSplits,
    });

    if (apiSplits !== undefined) {
      editionParams.splits = apiSplits;
    }
  }

  // Handle tag IDs - compare original tags with form tags to detect changes
  const originalTagIds = transaction.tags?.map((t) => t.id) ?? [];
  const formTagIds = form.tagIds ?? [];

  // Check if tags have changed
  const tagsChanged =
    originalTagIds.length !== formTagIds.length ||
    !originalTagIds.every((id) => formTagIds.includes(id)) ||
    !formTagIds.every((id) => originalTagIds.includes(id));

  if (tagsChanged) {
    // Send empty array to clear tags, or the new array of tag IDs
    editionParams.tagIds = formTagIds.length > 0 ? formTagIds : [];
  }

  return editionParams;
};
