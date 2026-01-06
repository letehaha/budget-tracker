import { OUT_OF_WALLET_ACCOUNT_MOCK, VERBOSE_PAYMENT_TYPES } from '@/common/const';
import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import {
  ACCOUNTS,
  USER_CATEGORIES,
  buildOutOfWalletTransaction,
  buildSystemExpenseTransaction,
  buildSystemIncomeTransaction,
  buildSystemTransferExpenseTransaction,
  buildSystemTransferOppositeTransaction,
  getUah2Account,
  getUahAccount,
} from '@tests/mocks';

import { getDestinationAmount, getFormTypeFromTransaction, getTxTypeFromFormType, prepopulateForm } from './helpers';
import { FORM_TYPES } from './types';

describe('components/modals/modify-record/helpers', () => {
  describe('getDestinationAmount', () => {
    test.each([
      [[10, 20, false, false, buildSystemIncomeTransaction()], 10],
      [[10, 20, false, true, buildSystemIncomeTransaction()], 10],
      [[10, 20, true, false, buildSystemIncomeTransaction()], 20],

      [[10, 20, false, false, buildSystemExpenseTransaction()], 10],
      [[10, 20, false, true, buildSystemExpenseTransaction()], 20],
      [[10, 20, true, false, buildSystemExpenseTransaction()], 20],
    ])('%s to be %s', (args, expected) => {
      expect(
        getDestinationAmount({
          fromAmount: args[0],
          toAmount: args[1],
          isCurrenciesDifferent: args[2],
          isRecordExternal: args[3],
          sourceTransaction: args[4],
        }),
      ).toBe(expected);
    });
  });

  describe('getFormTypeFromTransaction', () => {
    test.each([
      [buildSystemIncomeTransaction(), FORM_TYPES.income],
      [buildSystemExpenseTransaction(), FORM_TYPES.expense],
      [buildSystemTransferExpenseTransaction(), FORM_TYPES.transfer],
      [buildOutOfWalletTransaction(), FORM_TYPES.transfer],
    ])('%s to be %s', (value, expected) => {
      expect(getFormTypeFromTransaction(value)).toBe(expected);
    });
  });

  describe('getTxTypeFromFormType', () => {
    test.each([
      [FORM_TYPES.income, TRANSACTION_TYPES.income],
      [FORM_TYPES.expense, TRANSACTION_TYPES.expense],
      [FORM_TYPES.transfer, TRANSACTION_TYPES.expense],
    ])('%s to be %s', (value, expected) => {
      expect(getTxTypeFromFormType(value)).toBe(expected);
    });
  });

  describe('prepopulateForm', () => {
    const accountsRecord = ACCOUNTS.reduce(
      (acc, account) => {
        acc[account.id] = account;
        return acc;
      },
      {} as Record<number, (typeof ACCOUNTS)[0]>,
    );

    const categoriesRecord = USER_CATEGORIES.reduce(
      (acc, category) => {
        acc[category.id] = category;
        return acc;
      },
      {} as Record<number, (typeof USER_CATEGORIES)[0]>,
    );

    it('returns undefined when transaction is undefined', () => {
      const result = prepopulateForm({
        transaction: undefined,
        oppositeTransaction: undefined,
        accounts: accountsRecord,
        categories: categoriesRecord,
        formattedCategories: USER_CATEGORIES,
      });

      expect(result).toBeUndefined();
    });

    it('populates form for basic income transaction', () => {
      const transaction = buildSystemIncomeTransaction();

      const result = prepopulateForm({
        transaction,
        oppositeTransaction: undefined,
        accounts: accountsRecord,
        categories: categoriesRecord,
        formattedCategories: USER_CATEGORIES,
      });

      expect(result).toMatchObject({
        type: FORM_TYPES.income,
        amount: transaction.amount,
        account: accountsRecord[transaction.accountId],
        category: categoriesRecord[transaction.categoryId],
        note: transaction.note,
        refundedByTxs: undefined,
        refundsTx: undefined,
      });
      expect(result.time).toBeInstanceOf(Date);
      expect(result.paymentType.value).toBe(transaction.paymentType);
    });

    it('populates form for basic expense transaction', () => {
      const transaction = buildSystemExpenseTransaction();

      const result = prepopulateForm({
        transaction,
        oppositeTransaction: undefined,
        accounts: accountsRecord,
        categories: categoriesRecord,
        formattedCategories: USER_CATEGORIES,
      });

      expect(result).toMatchObject({
        type: FORM_TYPES.expense,
        amount: transaction.amount,
        account: accountsRecord[transaction.accountId],
        category: categoriesRecord[transaction.categoryId],
      });
    });

    it('populates form for transfer transaction with opposite transaction', () => {
      const sourceAccount = getUahAccount();
      const destinationAccount = getUah2Account();

      const transaction = buildSystemTransferExpenseTransaction({
        accountId: sourceAccount.id,
        amount: 1000,
      });
      const oppositeTransaction = buildSystemTransferOppositeTransaction({
        accountId: destinationAccount.id,
        amount: 1500,
        transferId: transaction.transferId,
      });

      const result = prepopulateForm({
        transaction,
        oppositeTransaction,
        accounts: accountsRecord,
        categories: categoriesRecord,
        formattedCategories: USER_CATEGORIES,
      });

      expect(result).toMatchObject({
        type: FORM_TYPES.transfer,
        amount: transaction.amount,
        account: sourceAccount,
        toAccount: destinationAccount,
        targetAmount: oppositeTransaction.amount,
      });
    });

    it('populates form for out-of-wallet income transaction (external → account)', () => {
      const destinationAccount = getUahAccount();

      const transaction = buildSystemIncomeTransaction({
        accountId: destinationAccount.id,
        amount: 500,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        transactionType: TRANSACTION_TYPES.income,
      });

      const result = prepopulateForm({
        transaction,
        oppositeTransaction: undefined,
        accounts: accountsRecord,
        categories: categoriesRecord,
        formattedCategories: USER_CATEGORIES,
      });

      expect(result).toMatchObject({
        type: FORM_TYPES.transfer,
        account: OUT_OF_WALLET_ACCOUNT_MOCK,
        toAccount: destinationAccount,
        targetAmount: transaction.amount,
      });
      // amount should not be set for income out-of-wallet
      expect(result.amount).toBeUndefined();
    });

    it('populates form for out-of-wallet expense transaction (account → external)', () => {
      const sourceAccount = getUahAccount();

      const transaction = buildSystemExpenseTransaction({
        accountId: sourceAccount.id,
        amount: 750,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        transactionType: TRANSACTION_TYPES.expense,
      });

      const result = prepopulateForm({
        transaction,
        oppositeTransaction: undefined,
        accounts: accountsRecord,
        categories: categoriesRecord,
        formattedCategories: USER_CATEGORIES,
      });

      expect(result).toMatchObject({
        type: FORM_TYPES.transfer,
        account: sourceAccount,
        toAccount: OUT_OF_WALLET_ACCOUNT_MOCK,
        amount: transaction.amount,
      });
      // targetAmount should not be set for expense out-of-wallet
      expect(result.targetAmount).toBeUndefined();
    });

    it('preserves transaction note', () => {
      const transaction = buildSystemExpenseTransaction({
        note: 'Test note for transaction',
      });

      const result = prepopulateForm({
        transaction,
        oppositeTransaction: undefined,
        accounts: accountsRecord,
        categories: categoriesRecord,
        formattedCategories: USER_CATEGORIES,
      });

      expect(result.note).toBe('Test note for transaction');
    });

    it('maps payment type correctly', () => {
      const transaction = buildSystemExpenseTransaction({
        paymentType: PAYMENT_TYPES.cash,
      });

      const result = prepopulateForm({
        transaction,
        oppositeTransaction: undefined,
        accounts: accountsRecord,
        categories: categoriesRecord,
        formattedCategories: USER_CATEGORIES,
      });

      expect(result.paymentType).toEqual(VERBOSE_PAYMENT_TYPES.find((p) => p.value === PAYMENT_TYPES.cash));
    });

    it('converts transaction time to Date object', () => {
      const txTime = new Date('2024-06-15T10:30:00Z');
      const transaction = buildSystemExpenseTransaction({
        time: txTime,
      });

      const result = prepopulateForm({
        transaction,
        oppositeTransaction: undefined,
        accounts: accountsRecord,
        categories: categoriesRecord,
        formattedCategories: USER_CATEGORIES,
      });

      expect(result.time).toBeInstanceOf(Date);
      expect(result.time.getTime()).toBe(txTime.getTime());
    });
  });
});
