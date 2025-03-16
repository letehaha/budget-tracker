import { OUT_OF_WALLET_ACCOUNT_MOCK, VERBOSE_PAYMENT_TYPES } from '@/common/const';
import {
  AccountModel,
  CategoryModel,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TransactionModel,
} from '@bt/shared/types';

import { FORM_TYPES, UI_FORM_STRUCT } from './types';

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

export const prepopulateForm = ({
  transaction,
  oppositeTransaction,
  categories,
  accounts,
}: {
  transaction: TransactionModel | undefined;
  oppositeTransaction: TransactionModel | undefined;
  categories: Record<number, CategoryModel>;
  accounts: Record<number, AccountModel>;
}) => {
  if (transaction) {
    const initialFormValues = {
      type: getFormTypeFromTransaction(transaction),
      category: categories[transaction.categoryId],
      time: new Date(transaction.time),
      paymentType: VERBOSE_PAYMENT_TYPES.find((item) => item.value === transaction.paymentType),
      note: transaction.note,
      refundedByTxs: undefined,
      refundsTx: undefined,
    } as UI_FORM_STRUCT;

    if (transaction.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) {
      if (transaction.transactionType === TRANSACTION_TYPES.income) {
        initialFormValues.account = OUT_OF_WALLET_ACCOUNT_MOCK;
        initialFormValues.targetAmount = transaction.amount;
        initialFormValues.toAccount = accounts[transaction.accountId];
      } else if (transaction.transactionType === TRANSACTION_TYPES.expense) {
        initialFormValues.amount = transaction.amount;
        initialFormValues.account = accounts[transaction.accountId];
        initialFormValues.toAccount = OUT_OF_WALLET_ACCOUNT_MOCK;
      }
    } else {
      initialFormValues.amount = transaction.amount;
      initialFormValues.account = accounts[transaction.accountId];

      if (oppositeTransaction) {
        initialFormValues.toAccount = accounts[oppositeTransaction.accountId];
        initialFormValues.targetAmount = oppositeTransaction.amount;
      }
    }
    return initialFormValues;
  }
  return undefined;
};
