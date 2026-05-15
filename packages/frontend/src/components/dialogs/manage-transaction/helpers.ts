import { OUT_OF_WALLET_ACCOUNT_MOCK, VERBOSE_PAYMENT_TYPES } from '@/common/const';
import type { FormattedCategory } from '@/common/types';
import {
  ACCOUNT_TYPES,
  AccountModel,
  CategoryModel,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TransactionModel,
} from '@bt/shared/types';

import { FORM_TYPES, type FormSplit, UI_FORM_STRUCT } from './types';

export const getDestinationAccount = ({
  isRecordExternal,
  sourceTransaction,
  account,
  toAccount,
}: {
  isRecordExternal: boolean;
  sourceTransaction: TransactionModel;
  account: AccountModel;
  toAccount: AccountModel;
}) => {
  if (isRecordExternal) {
    const isIncome = sourceTransaction.transactionType === TRANSACTION_TYPES.income;
    return isIncome ? account : toAccount;
  }
  return toAccount;
};

export const getDestinationAmount = ({
  fromAmount,
  toAmount,
  isCurrenciesDifferent,
  isRecordExternal,
  sourceTransaction,
}: {
  fromAmount: number;
  toAmount: number;
  isCurrenciesDifferent: boolean;
  isRecordExternal: boolean;
  sourceTransaction: TransactionModel;
}) => {
  if (isRecordExternal) {
    const isIncome = sourceTransaction.transactionType === TRANSACTION_TYPES.income;
    return isIncome ? fromAmount : toAmount;
  }
  return isCurrenciesDifferent ? toAmount : fromAmount;
};

export const getFormTypeFromTransaction = (tx: TransactionModel): FORM_TYPES => {
  if (
    [TRANSACTION_TRANSFER_NATURE.common_transfer, TRANSACTION_TRANSFER_NATURE.transfer_out_wallet].includes(
      tx.transferNature,
    )
  ) {
    return FORM_TYPES.transfer;
  }

  return tx.transactionType === TRANSACTION_TYPES.expense ? FORM_TYPES.expense : FORM_TYPES.income;
};

export const getTxTypeFromFormType = (formType: FORM_TYPES): TRANSACTION_TYPES => {
  // When user creates a brand-new "transfer" transaction, it's always should be
  // considered as "expense"
  if (formType === FORM_TYPES.transfer) return TRANSACTION_TYPES.expense;

  return formType === FORM_TYPES.expense ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income;
};

export const isOutOfWalletAccount = (account: typeof OUT_OF_WALLET_ACCOUNT_MOCK) => account._isOutOfWallet;

// The backend cascades a transfer delete across both legs, so an external-bank
// partner (which can't be removed) would orphan the call — hide the button instead.
export const canDeleteTransaction = ({
  transaction,
  oppositeTransaction,
  accounts,
  canMutate,
}: {
  transaction: TransactionModel | undefined | null;
  oppositeTransaction: TransactionModel | undefined | null;
  accounts: Record<number, AccountModel>;
  canMutate: boolean;
}): boolean => {
  if (!transaction || !canMutate) return false;
  const primaryAccount = accounts[transaction.accountId];
  if (!primaryAccount || primaryAccount.type !== ACCOUNT_TYPES.system) return false;
  if (oppositeTransaction) {
    const oppositeAccount = accounts[oppositeTransaction.accountId];
    if (!oppositeAccount || oppositeAccount.type !== ACCOUNT_TYPES.system) return false;
  }
  return true;
};

/**
 * Builds a flat map of category id -> FormattedCategory from the nested structure
 */
const buildFormattedCategoriesMap = (
  categories: FormattedCategory[],
  map: Record<number, FormattedCategory> = {},
): Record<number, FormattedCategory> => {
  for (const category of categories) {
    map[category.id] = category;
    if (category.subCategories?.length > 0) {
      buildFormattedCategoriesMap(category.subCategories, map);
    }
  }
  return map;
};

export const prepopulateForm = ({
  transaction,
  oppositeTransaction,
  categories,
  accounts,
  formattedCategories,
}: {
  transaction: TransactionModel | undefined;
  oppositeTransaction: TransactionModel | undefined;
  categories: Record<number, CategoryModel>;
  accounts: Record<number, AccountModel>;
  formattedCategories: FormattedCategory[];
}) => {
  if (transaction) {
    // Build a flat map from formattedCategories for split conversion
    const formattedCategoriesMap = buildFormattedCategoriesMap(formattedCategories);

    // Transfers are created without a category (see `prepare-tx-creation-params.ts`), so the
    // source/opposite rows persist with `categoryId === null`. When the user later toggles a
    // transfer back to a regular expense/income, the form needs *some* selected category or
    // `prepareTxUpdationParams` would dereference a null. Fall back to the first available
    // formatted category so the picker starts with a sensible default — same shape any
    // freshly-created expense begins with.
    const resolvedCategory =
      formattedCategoriesMap[transaction.categoryId] ??
      categories[transaction.categoryId] ??
      formattedCategories[0] ??
      null;

    const initialFormValues = {
      type: getFormTypeFromTransaction(transaction),
      category: resolvedCategory,
      time: new Date(transaction.time),
      paymentType: VERBOSE_PAYMENT_TYPES.find((item) => item.value === transaction.paymentType),
      note: transaction.note ?? undefined,
      refundedByTxs: undefined,
      refundsTx: undefined,
      // Extract tag IDs from transaction tags if present
      tagIds: transaction.tags?.map((tag) => tag.id) ?? [],
    } as UI_FORM_STRUCT;

    // Convert transaction splits to form splits
    if (transaction.splits && transaction.splits.length > 0) {
      initialFormValues.splits = transaction.splits.map(
        (split): FormSplit => ({
          id: split.id,
          category: formattedCategoriesMap[split.categoryId] ?? null,
          amount: split.amount,
          note: split.note,
        }),
      );
    }

    if (transaction.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
      if (transaction.transactionType === TRANSACTION_TYPES.income) {
        initialFormValues.account = OUT_OF_WALLET_ACCOUNT_MOCK;
        initialFormValues.targetAmount = transaction.amount;
        initialFormValues.toAccount = accounts[transaction.accountId]!;
      } else if (transaction.transactionType === TRANSACTION_TYPES.expense) {
        initialFormValues.amount = transaction.amount;
        initialFormValues.account = accounts[transaction.accountId]!;
        initialFormValues.toAccount = OUT_OF_WALLET_ACCOUNT_MOCK;
      }
    } else {
      // The form maps "amount/account" to the source (expense) side and
      // "targetAmount/toAccount" to the destination (income) side. When the primary
      // `transaction` is the income side (typical for external income transfers),
      // the source is the opposite transaction — flip the assignment accordingly so
      // the form-data layout doesn't depend on which side the caller treats as primary.
      const isTxIncome = transaction.transactionType === TRANSACTION_TYPES.income;
      const sourceTx = isTxIncome && oppositeTransaction ? oppositeTransaction : transaction;

      initialFormValues.amount = sourceTx.amount;
      initialFormValues.account = accounts[sourceTx.accountId]!;

      if (oppositeTransaction) {
        const destinationTx = isTxIncome ? transaction : oppositeTransaction;
        initialFormValues.toAccount = accounts[destinationTx.accountId]!;
        initialFormValues.targetAmount = destinationTx.amount;
      }
    }
    return initialFormValues;
  }
  return undefined;
};
