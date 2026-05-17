import { OUT_OF_WALLET_ACCOUNT_MOCK, VERBOSE_PAYMENT_TYPES } from '@/common/const';
import {
  ACCOUNT_TYPES,
  AccountModel,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TransactionModel,
} from '@bt/shared/types';
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

import {
  canDeleteTransaction,
  getDestinationAmount,
  getFormTypeFromTransaction,
  getTxTypeFromFormType,
  prepopulateForm,
} from './helpers';
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
          fromAmount: args[0] as number,
          toAmount: args[1] as number,
          isCurrenciesDifferent: args[2] as boolean,
          isRecordExternal: args[3] as boolean,
          sourceTransaction: args[4] as TransactionModel,
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
      {} as Record<string, (typeof ACCOUNTS)[0]>,
    );

    const categoriesRecord = USER_CATEGORIES.reduce(
      (acc, category) => {
        acc[category.id] = category;
        return acc;
      },
      {} as Record<string, (typeof USER_CATEGORIES)[0]>,
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
      expect(result!.time).toBeInstanceOf(Date);
      expect(result!.paymentType!.value).toBe(transaction.paymentType);
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

    it('flips source/destination when transaction is the income side of a transfer', () => {
      // Mirrors the external income → transfer flow where the user-facing primary
      // tx is the income side; the form-data layout still expects amount/account
      // to be the source (expense) side.
      const incomeAccount = getUahAccount();
      const expenseAccount = getUah2Account();

      const transaction = buildSystemTransferOppositeTransaction({
        accountId: incomeAccount.id,
        amount: 800,
      });
      const oppositeTransaction = buildSystemTransferExpenseTransaction({
        accountId: expenseAccount.id,
        amount: 800,
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
        amount: oppositeTransaction.amount,
        account: expenseAccount,
        toAccount: incomeAccount,
        targetAmount: transaction.amount,
      });
    });

    it('falls back to first formatted category when transaction.categoryId is null', () => {
      // Transfers are created with `categoryId: null` (see `prepare-tx-creation-params.ts`),
      // so prepopulating a transfer-mode edit without a fallback would leave form.category
      // null and crash `prepareTxUpdationParams` on the way back out. Verify the picker
      // starts with a sensible default — same behavior any freshly-created expense gets.
      const sourceAccount = getUahAccount();
      const transaction = buildSystemTransferExpenseTransaction({
        accountId: sourceAccount.id,
        categoryId: null as unknown as string,
      });

      const result = prepopulateForm({
        transaction,
        oppositeTransaction: undefined,
        accounts: accountsRecord,
        categories: categoriesRecord,
        formattedCategories: USER_CATEGORIES,
      });

      expect(result?.category).toEqual(USER_CATEGORIES[0]);
    });

    it('falls back to the income tx itself as source when no opposite is provided', () => {
      // Edge case: an income transfer rendered before the opposite side is loaded.
      // The flip in prepopulateForm should not blow up — it should treat the
      // single tx as the source so the form still has *something* to render.
      const incomeAccount = getUahAccount();

      const transaction = buildSystemTransferOppositeTransaction({
        accountId: incomeAccount.id,
        amount: 500,
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
        amount: transaction.amount,
        account: incomeAccount,
      });
      expect(result!.toAccount).toBeUndefined();
      expect(result!.targetAmount).toBeUndefined();
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
      expect(result!.amount).toBeUndefined();
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
      expect(result!.targetAmount).toBeUndefined();
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

      expect(result!.note).toBe('Test note for transaction');
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

      expect(result!.paymentType).toEqual(VERBOSE_PAYMENT_TYPES.find((p) => p.value === PAYMENT_TYPES.cash));
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

      expect(result!.time).toBeInstanceOf(Date);
      expect(result!.time.getTime()).toBe(txTime.getTime());
    });
  });

  describe('canDeleteTransaction', () => {
    const sourceAccount = getUahAccount();
    const destSystemAccount = getUah2Account();
    const destMonobankAccount = {
      ...getUah2Account(),
      id: '00000000-0000-0000-0000-000000000099',
      type: ACCOUNT_TYPES.monobank,
    } as AccountModel;

    const accounts: Record<string, AccountModel> = {
      [sourceAccount.id!]: sourceAccount as AccountModel,
      [destSystemAccount.id!]: destSystemAccount as AccountModel,
      [destMonobankAccount.id]: destMonobankAccount,
    };

    it('returns false when there is no transaction (create mode)', () => {
      expect(
        canDeleteTransaction({ transaction: undefined, oppositeTransaction: undefined, accounts, canMutate: true }),
      ).toBe(false);
    });

    it('returns false when caller cannot mutate the tx', () => {
      const transaction = buildSystemExpenseTransaction({ accountId: sourceAccount.id! });
      expect(canDeleteTransaction({ transaction, oppositeTransaction: undefined, accounts, canMutate: false })).toBe(
        false,
      );
    });

    it('returns true for a plain system expense the caller can mutate', () => {
      const transaction = buildSystemExpenseTransaction({ accountId: sourceAccount.id! });
      expect(canDeleteTransaction({ transaction, oppositeTransaction: undefined, accounts, canMutate: true })).toBe(
        true,
      );
    });

    it('returns true for a system-to-system transfer pair', () => {
      const transaction = buildSystemTransferExpenseTransaction({ accountId: sourceAccount.id! });
      const oppositeTransaction = buildSystemTransferOppositeTransaction({
        accountId: destSystemAccount.id!,
        transferId: transaction.transferId,
      });
      expect(canDeleteTransaction({ transaction, oppositeTransaction, accounts, canMutate: true })).toBe(true);
    });

    it('returns false when the opposite leg lives on an external (monobank) account', () => {
      // Regression: deleting only the system leg would orphan the external income row,
      // since the backend cascades the pair but cannot remove the monobank-side tx.
      const transaction = buildSystemTransferExpenseTransaction({ accountId: sourceAccount.id! });
      const oppositeTransaction = buildSystemTransferOppositeTransaction({
        accountId: destMonobankAccount.id,
        transferId: transaction.transferId,
      });
      expect(canDeleteTransaction({ transaction, oppositeTransaction, accounts, canMutate: true })).toBe(false);
    });

    it('returns false when the primary tx is on an external account (existing behavior preserved)', () => {
      const transaction = buildSystemExpenseTransaction({ accountId: destMonobankAccount.id });
      expect(canDeleteTransaction({ transaction, oppositeTransaction: undefined, accounts, canMutate: true })).toBe(
        false,
      );
    });
  });
});
