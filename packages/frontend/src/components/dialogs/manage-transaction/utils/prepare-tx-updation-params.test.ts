import { OUT_OF_WALLET_ACCOUNT_MOCK, VERBOSE_PAYMENT_TYPES } from '@/common/const';
import {
  ACCOUNT_CATEGORIES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  AccountModel,
  TransactionModel,
  type RecordId,
} from '@bt/shared/types';
import {
  USER_CATEGORIES,
  buildExternalExpenseTransaction,
  buildOutOfWalletTransaction,
  buildSystemExpenseTransaction,
  buildSystemIncomeTransaction,
  buildSystemTransferExpenseTransaction,
  getUah2Account,
  getUahAccount,
} from '@tests/mocks';

import { FORM_TYPES, UI_FORM_STRUCT } from '../types';
import { prepareTxUpdationParams } from './prepare-tx-updation-params';

const buildBaseFormMock = (
  transaction: TransactionModel,
): Pick<UI_FORM_STRUCT, 'time' | 'note' | 'paymentType' | 'refundedByTxs' | 'category' | 'refundsTx'> => ({
  time: transaction.time,
  note: undefined,
  paymentType: VERBOSE_PAYMENT_TYPES.find((i) => i.value === transaction.paymentType) ?? null,
  refundedByTxs: undefined,
  category: undefined as unknown as UI_FORM_STRUCT['category'],
  refundsTx: undefined,
});

describe('prepareTxUpdationParams', () => {
  let sourceAccount: ReturnType<typeof getUahAccount>;
  let destinationAccount: ReturnType<typeof getUahAccount>;
  let transactionMock: ReturnType<typeof buildOutOfWalletTransaction>;

  describe('out_of_wallet details edition', () => {
    beforeEach(() => {
      destinationAccount = getUahAccount();
      transactionMock = buildOutOfWalletTransaction();
    });

    it('handles "out_of_wallet -> account" updation', () => {
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(transactionMock),
        type: FORM_TYPES.transfer,
        account: OUT_OF_WALLET_ACCOUNT_MOCK,
        amount: null,
        targetAmount: 1000,
        toAccount: destinationAccount as AccountModel,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: transactionMock,
          linkedTransaction: null,
          isTransferTx: true,
          isRecordExternal: false,
          isCurrenciesDifferent: true,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: transactionMock.id,
        amount: formMock.targetAmount,
        note: formMock.note,
        time: expect.anything(),
        // out_of_wallet -> account = income
        transactionType: TRANSACTION_TYPES.income,
        paymentType: transactionMock.paymentType,
        accountId: formMock.toAccount!.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      });
    });
    it('handles "account -> out_of_wallet" updation', () => {
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(transactionMock),
        type: FORM_TYPES.transfer,
        account: destinationAccount as AccountModel,
        amount: 1000,
        targetAmount: null,
        toAccount: OUT_OF_WALLET_ACCOUNT_MOCK,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: transactionMock,
          linkedTransaction: null,
          isTransferTx: true,
          isRecordExternal: false,
          isCurrenciesDifferent: true,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: transactionMock.id,
        amount: formMock.amount,
        note: formMock.note,
        time: expect.anything(),
        // account -> out_of_wallet = expense
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: transactionMock.paymentType,
        accountId: formMock.account!.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      });
    });
  });

  describe('common transfer', () => {
    it('handles same-currency amount updation', () => {
      sourceAccount = getUah2Account();
      destinationAccount = getUahAccount();
      transactionMock = buildSystemTransferExpenseTransaction();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(transactionMock),
        type: FORM_TYPES.transfer,
        account: sourceAccount as AccountModel,
        amount: 2000,
        targetAmount: 2500,
        toAccount: destinationAccount as AccountModel,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: transactionMock,
          linkedTransaction: null,
          isTransferTx: true,
          isRecordExternal: false,
          isCurrenciesDifferent: true,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: transactionMock.id,
        accountId: formMock.account!.id,
        amount: +formMock.amount!,

        destinationAccountId: formMock.toAccount!.id,
        destinationAmount: +formMock.targetAmount!,

        note: formMock.note,
        time: expect.anything(),
        // for common transfers it's always `expense` transaction as a source
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: transactionMock.paymentType,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      });
    });
  });

  describe('loan transfer nature handling', () => {
    beforeEach(() => {
      sourceAccount = getUahAccount();
    });

    it('keeps common_transfer on an existing pair even when the destination is a loan account', () => {
      const transferTx = buildSystemTransferExpenseTransaction();
      const loanAccount = getUah2Account({ accountCategory: ACCOUNT_CATEGORIES.loan });
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(transferTx),
        type: FORM_TYPES.transfer,
        account: sourceAccount as AccountModel,
        amount: 2000,
        targetAmount: 2000,
        toAccount: loanAccount as AccountModel,
      };

      const result = prepareTxUpdationParams({
        form: formMock,
        transaction: transferTx,
        linkedTransaction: null,
        isTransferTx: true,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
      expect(result.destinationAccountId).toBe(loanAccount.id);
    });

    it('keeps transfer_to_loan on an existing loan payment pair', () => {
      const loanPaymentTx = buildSystemTransferExpenseTransaction({
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
      });
      const loanAccount = getUah2Account({ accountCategory: ACCOUNT_CATEGORIES.loan });
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(loanPaymentTx),
        type: FORM_TYPES.transfer,
        account: sourceAccount as AccountModel,
        amount: 2000,
        targetAmount: 2000,
        toAccount: loanAccount as AccountModel,
      };

      const result = prepareTxUpdationParams({
        form: formMock,
        transaction: loanPaymentTx,
        linkedTransaction: null,
        isTransferTx: true,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(result.destinationAccountId).toBe(loanAccount.id);
    });

    it('promotes a non-transfer transaction to transfer_to_loan when the destination is a loan account', () => {
      const expenseTx = buildSystemExpenseTransaction();
      const loanAccount = getUah2Account({ accountCategory: ACCOUNT_CATEGORIES.loan });
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.transfer,
        account: sourceAccount as AccountModel,
        amount: 2000,
        targetAmount: 2000,
        toAccount: loanAccount as AccountModel,
      };

      const result = prepareTxUpdationParams({
        form: formMock,
        transaction: expenseTx,
        linkedTransaction: null,
        isTransferTx: true,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_loan);
      expect(result.destinationAccountId).toBe(loanAccount.id);
      expect(result.destinationAmount).toBe(2000);
    });

    it('promotes a non-transfer transaction to common_transfer when the destination is not a loan account', () => {
      const expenseTx = buildSystemExpenseTransaction();
      const regularAccount = getUah2Account();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.transfer,
        account: sourceAccount as AccountModel,
        amount: 2000,
        targetAmount: 2000,
        toAccount: regularAccount as AccountModel,
      };

      const result = prepareTxUpdationParams({
        form: formMock,
        transaction: expenseTx,
        linkedTransaction: null,
        isTransferTx: true,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    });
  });

  describe('external record handling', () => {
    it('handles external record updation', () => {
      const expenseTx = buildExternalExpenseTransaction();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.expense,
        account: null,
        amount: 1500,
        note: 'Updated external record',
        paymentType: VERBOSE_PAYMENT_TYPES.find((p) => p.value === 'cash') ?? null,
        category: USER_CATEGORIES[0]!,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: expenseTx,
          linkedTransaction: null,
          isTransferTx: false,
          isRecordExternal: true,
          isCurrenciesDifferent: false,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: expenseTx.id,
        note: formMock.note,
        paymentType: formMock.paymentType!.value,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        categoryId: formMock.category.id,
      });
    });

    it('handles external expense → transfer_out_wallet (account → out_of_wallet) conversion without transactionType', () => {
      const expenseTx = buildExternalExpenseTransaction();
      const destAccount = getUahAccount();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.transfer,
        account: destAccount as AccountModel,
        amount: 1500,
        targetAmount: null,
        toAccount: OUT_OF_WALLET_ACCOUNT_MOCK,
      };

      const result = prepareTxUpdationParams({
        form: formMock,
        transaction: expenseTx,
        linkedTransaction: null,
        isTransferTx: true,
        isRecordExternal: true,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result).toEqual({
        txId: expenseTx.id,
        note: formMock.note,
        paymentType: formMock.paymentType!.value,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      });

      // Ensure transactionType is NOT set for external transactions (restricted field)
      expect(result).not.toHaveProperty('transactionType');
    });

    it('handles external expense → transfer_out_wallet (out_of_wallet → account) conversion without transactionType', () => {
      const expenseTx = buildExternalExpenseTransaction();
      const destAccount = getUahAccount();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.transfer,
        account: OUT_OF_WALLET_ACCOUNT_MOCK,
        amount: null,
        targetAmount: 1500,
        toAccount: destAccount as AccountModel,
      };

      const result = prepareTxUpdationParams({
        form: formMock,
        transaction: expenseTx,
        linkedTransaction: null,
        isTransferTx: true,
        isRecordExternal: true,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result).toEqual({
        txId: expenseTx.id,
        note: formMock.note,
        paymentType: formMock.paymentType!.value,
        accountId: destinationAccount.id,
        amount: formMock.targetAmount,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      });

      // Ensure transactionType is NOT set for external transactions (restricted field)
      expect(result).not.toHaveProperty('transactionType');
    });
  });

  describe('income/expense conversions', () => {
    beforeEach(() => {
      sourceAccount = getUahAccount();
      destinationAccount = getUah2Account();
    });

    it('handles "income -> expense" updation', () => {
      const incomeTx = buildSystemIncomeTransaction();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(incomeTx),
        type: FORM_TYPES.expense,
        account: sourceAccount as AccountModel,
        amount: 1500,
        category: USER_CATEGORIES[0]!,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: incomeTx,
          linkedTransaction: null,
          isTransferTx: false,
          isRecordExternal: false,
          isCurrenciesDifferent: false,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: incomeTx.id,
        amount: formMock.amount,
        note: formMock.note,
        time: expect.anything(),
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: incomeTx.paymentType,
        accountId: formMock.account!.id,
        categoryId: formMock.category.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      });
    });

    it('handles "expense -> income" updation', () => {
      const expenseTx = buildSystemExpenseTransaction();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.income,
        account: sourceAccount as AccountModel,
        amount: 1500,
        category: USER_CATEGORIES[0]!,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: expenseTx,
          linkedTransaction: null,
          isTransferTx: false,
          isRecordExternal: false,
          isCurrenciesDifferent: false,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: expenseTx.id,
        amount: formMock.amount,
        note: formMock.note,
        time: expect.anything(),
        transactionType: TRANSACTION_TYPES.income,
        paymentType: expenseTx.paymentType,
        accountId: formMock.account!.id,
        categoryId: formMock.category.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      });
    });
  });

  describe('transfer conversions', () => {
    beforeEach(() => {
      sourceAccount = getUahAccount();
      destinationAccount = getUah2Account();
    });

    it('handles "income -> common_transfer" updation', () => {
      const incomeTx = buildSystemIncomeTransaction();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(incomeTx),
        type: FORM_TYPES.transfer,
        account: sourceAccount as AccountModel,
        amount: 2000,
        targetAmount: 2000,
        toAccount: destinationAccount as AccountModel,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: incomeTx,
          linkedTransaction: null,
          isTransferTx: true,
          isRecordExternal: false,
          isCurrenciesDifferent: false,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: incomeTx.id,
        accountId: formMock.account!.id,
        amount: +formMock.amount!,
        destinationAccountId: formMock.toAccount!.id,
        destinationAmount: +formMock.targetAmount!,
        note: formMock.note,
        time: expect.anything(),
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: incomeTx.paymentType,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      });
    });

    it('handles "expense -> transfer_out_wallet" updation', () => {
      const expenseTx = buildSystemExpenseTransaction();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.transfer,
        account: sourceAccount as AccountModel,
        amount: 1500,
        targetAmount: null,
        toAccount: OUT_OF_WALLET_ACCOUNT_MOCK,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: expenseTx,
          linkedTransaction: null,
          isTransferTx: true,
          isRecordExternal: false,
          isCurrenciesDifferent: false,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: expenseTx.id,
        amount: formMock.amount,
        note: formMock.note,
        time: expect.anything(),
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: expenseTx.paymentType,
        accountId: formMock.account!.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      });
    });

    it('does not crash when converting common_transfer → expense with a null form.category', () => {
      // Pre-existing FE issue surfaced by the cross-user transfer flow: transfers are
      // persisted with `categoryId: null` and if the user toggles to expense before
      // picking a category, dereferencing `category.id` would throw a TypeError. The
      // dialog should still submit; the backend keeps the existing column.
      const transferTx = buildSystemTransferExpenseTransaction({
        categoryId: null as unknown as RecordId,
      });
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(transferTx),
        type: FORM_TYPES.expense,
        account: sourceAccount as AccountModel,
        amount: 1500,
        // category intentionally left as the buildBaseFormMock default (null).
      };

      const result = prepareTxUpdationParams({
        form: formMock,
        transaction: transferTx,
        linkedTransaction: null,
        isTransferTx: false,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result).not.toHaveProperty('categoryId');
      expect(result).toMatchObject({
        txId: transferTx.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        transactionType: TRANSACTION_TYPES.expense,
        accountId: formMock.account!.id,
      });
    });

    it('handles "transfer_out_wallet -> expense" updation', () => {
      const outOfWalletTx = buildOutOfWalletTransaction();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(outOfWalletTx),
        type: FORM_TYPES.expense,
        account: sourceAccount as AccountModel,
        amount: 1500,
        category: USER_CATEGORIES[0]!,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: outOfWalletTx,
          linkedTransaction: null,
          isTransferTx: false,
          isRecordExternal: false,
          isCurrenciesDifferent: false,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: outOfWalletTx.id,
        amount: formMock.amount,
        note: formMock.note,
        time: expect.anything(),
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: outOfWalletTx.paymentType,
        accountId: formMock.account!.id,
        categoryId: formMock.category.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      });
    });
  });

  describe('refund handling', () => {
    beforeEach(() => {
      sourceAccount = getUahAccount();
    });

    it('handles refundsTx addition', () => {
      const expenseTx = buildSystemExpenseTransaction();
      const refundTx = buildSystemIncomeTransaction();
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.expense,
        account: sourceAccount as AccountModel,
        amount: 1500,
        category: USER_CATEGORIES[0]!,
        refundsTx: { transaction: refundTx },
        refundedByTxs: null,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: expenseTx,
          linkedTransaction: null,
          isTransferTx: false,
          isRecordExternal: false,
          isCurrenciesDifferent: false,
          isOriginalRefundsOverriden: true,
        }),
      ).toEqual({
        txId: expenseTx.id,
        amount: formMock.amount,
        note: formMock.note,
        time: expect.anything(),
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: expenseTx.paymentType,
        accountId: formMock.account!.id,
        categoryId: formMock.category.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        refundsTxId: refundTx.id,
        refundsSplitId: null,
      });
    });

    it('handles refundedByTxs addition', () => {
      const expenseTx = buildSystemExpenseTransaction();
      const refundingTxs = [buildSystemIncomeTransaction(), buildSystemIncomeTransaction()];
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.expense,
        account: sourceAccount as AccountModel,
        amount: 1500,
        category: USER_CATEGORIES[0]!,
        refundsTx: null,
        refundedByTxs: refundingTxs.map((tx) => ({ transaction: tx })),
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: expenseTx,
          linkedTransaction: null,
          isTransferTx: false,
          isRecordExternal: false,
          isCurrenciesDifferent: false,
          isOriginalRefundsOverriden: true,
        }),
      ).toEqual({
        txId: expenseTx.id,
        amount: formMock.amount,
        note: formMock.note,
        time: expect.anything(),
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: expenseTx.paymentType,
        accountId: formMock.account!.id,
        categoryId: formMock.category.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        refundedByTxIds: [refundingTxs[0]!.id, refundingTxs[1]!.id],
      });
    });
  });

  describe('linked transactions', () => {
    beforeEach(() => {
      sourceAccount = getUahAccount();
      destinationAccount = getUah2Account();
    });

    it('handles common transfer with linked transaction', () => {
      const expenseTx = buildSystemExpenseTransaction();
      const linkedTx = buildSystemIncomeTransaction(); // opposite txType
      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.transfer,
        account: sourceAccount as AccountModel,
        amount: 2000,
        targetAmount: 2000,
        toAccount: destinationAccount as AccountModel,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: expenseTx,
          linkedTransaction: linkedTx,
          isTransferTx: true,
          isRecordExternal: false,
          isCurrenciesDifferent: false,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: expenseTx.id,
        accountId: formMock.account!.id,
        amount: +formMock.amount!,
        note: formMock.note,
        time: expect.anything(),
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: expenseTx.paymentType,
        destinationTransactionId: linkedTx.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      });
    });

    it('throws error when linked transaction is not opposite to source one', () => {
      const expenseTx = buildSystemExpenseTransaction();
      const linkedTx = buildSystemExpenseTransaction();

      const formMock: UI_FORM_STRUCT = {
        ...buildBaseFormMock(expenseTx),
        type: FORM_TYPES.transfer,
        account: sourceAccount as AccountModel,
        amount: 2000,
        targetAmount: 2000,
        toAccount: destinationAccount as AccountModel,
      };

      expect(
        prepareTxUpdationParams({
          form: formMock,
          transaction: expenseTx,
          linkedTransaction: linkedTx,
          isTransferTx: true,
          isRecordExternal: false,
          isCurrenciesDifferent: false,
          isOriginalRefundsOverriden: false,
        }),
      ).toEqual({
        txId: expenseTx.id,
        accountId: formMock.account!.id,
        amount: +formMock.amount!,
        note: formMock.note,
        time: expect.anything(),
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: expenseTx.paymentType,
        destinationTransactionId: linkedTx.id,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      });
    });
  });
});
