import { OUT_OF_WALLET_ACCOUNT_MOCK } from '@/common/const';
import {
  type AccountModel,
  type CategoryModel,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  type TransactionModel,
} from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { FORM_TYPES, UI_FORM_STRUCT } from '../types';
import { prepareTxCreationParams } from './prepare-tx-creation-params';
import { prepareTxUpdationParams } from './prepare-tx-updation-params';

const createMockAccount = (overrides: Partial<AccountModel> = {}): AccountModel =>
  ({
    id: 1,
    name: 'Test Account',
    currencyCode: 'USD',
    currentBalance: 1000,
    ...overrides,
  }) as AccountModel;

const createMockCategory = (overrides: Partial<CategoryModel> = {}): CategoryModel =>
  ({
    id: 1,
    name: 'Test Category',
    ...overrides,
  }) as CategoryModel;

const createMockTransaction = (overrides: Partial<TransactionModel> = {}): TransactionModel =>
  ({
    id: 100,
    amount: 500,
    accountId: 1,
    categoryId: 1,
    transactionType: TRANSACTION_TYPES.expense,
    transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    paymentType: PAYMENT_TYPES.creditCard,
    time: new Date('2024-01-15'),
    note: 'Test note',
    transferId: null,
    ...overrides,
  }) as TransactionModel;

const createBaseForm = (overrides: Partial<UI_FORM_STRUCT> = {}): UI_FORM_STRUCT => ({
  amount: 100,
  account: createMockAccount(),
  toAccount: undefined,
  category: createMockCategory(),
  time: new Date('2024-01-15T12:00:00Z'),
  paymentType: { value: PAYMENT_TYPES.creditCard, label: 'Credit Card' },
  note: 'Test note',
  type: FORM_TYPES.expense,
  targetAmount: undefined,
  refundedByTxs: undefined,
  refundsTx: undefined,
  ...overrides,
});

describe('prepareTxCreationParams', () => {
  describe('basic transactions', () => {
    it('creates expense transaction params', () => {
      const form = createBaseForm({ type: FORM_TYPES.expense });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: false,
        isCurrenciesDifferent: false,
      });

      expect(result).toEqual({
        amount: 100,
        note: 'Test note',
        time: form.time.toUTCString(),
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: PAYMENT_TYPES.creditCard,
        accountId: 1,
        categoryId: 1,
      });
    });

    it('creates income transaction params', () => {
      const form = createBaseForm({ type: FORM_TYPES.income });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: false,
        isCurrenciesDifferent: false,
      });

      expect(result).toMatchObject({
        transactionType: TRANSACTION_TYPES.income,
        categoryId: 1,
      });
    });
  });

  describe('transfer transactions', () => {
    it('creates transfer with same currency', () => {
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        toAccount: createMockAccount({ id: 2, name: 'Destination Account' }),
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: true,
        isCurrenciesDifferent: false,
      });

      expect(result).toMatchObject({
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAccountId: 2,
        destinationAmount: 100,
      });
      expect(result.categoryId).toBeUndefined();
    });

    it('creates transfer with different currencies', () => {
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        toAccount: createMockAccount({ id: 2, currencyCode: 'EUR' }),
        targetAmount: 90,
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: true,
        isCurrenciesDifferent: true,
      });

      expect(result).toMatchObject({
        destinationAmount: 90,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      });
    });
  });

  describe('out of wallet transfers', () => {
    it('handles "from" account as out of wallet (income)', () => {
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        account: OUT_OF_WALLET_ACCOUNT_MOCK,
        toAccount: createMockAccount({ id: 2 }),
        targetAmount: 100,
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: true,
        isCurrenciesDifferent: false,
      });

      expect(result).toMatchObject({
        transactionType: TRANSACTION_TYPES.income,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        accountId: 2,
        amount: 100,
      });
      expect(result.destinationAccountId).toBeUndefined();
      expect(result.destinationAmount).toBeUndefined();
    });

    it('handles "to" account as out of wallet (expense)', () => {
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        account: createMockAccount({ id: 1 }),
        toAccount: OUT_OF_WALLET_ACCOUNT_MOCK,
        amount: 100,
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: true,
        isCurrenciesDifferent: false,
      });

      expect(result).toMatchObject({
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        accountId: 1,
        amount: 100,
      });
      expect(result.destinationAccountId).toBeUndefined();
      expect(result.destinationAmount).toBeUndefined();
    });
  });

  describe('refund transactions', () => {
    it('includes refundForTxId when refundsTx is set', () => {
      const refundedTransaction = createMockTransaction({ id: 50 });
      const form = createBaseForm({
        refundsTx: refundedTransaction,
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: false,
        isCurrenciesDifferent: false,
      });

      expect(result.refundForTxId).toBe(50);
    });

    it('does not include refundForTxId when refundsTx is undefined', () => {
      const form = createBaseForm({ refundsTx: undefined });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: false,
        isCurrenciesDifferent: false,
      });

      expect(result.refundForTxId).toBeUndefined();
    });
  });
});

describe('prepareTxUpdationParams', () => {
  describe('basic updates', () => {
    it('updates non-external expense transaction', () => {
      const transaction = createMockTransaction();
      const form = createBaseForm({
        amount: 200,
        note: 'Updated note',
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: null,
        isTransferTx: false,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result).toMatchObject({
        txId: 100,
        amount: 200,
        note: 'Updated note',
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: PAYMENT_TYPES.creditCard,
        accountId: 1,
        categoryId: 1,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      });
    });

    it('updates external record with limited fields', () => {
      const transaction = createMockTransaction();
      const form = createBaseForm({
        note: 'External note',
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: null,
        isTransferTx: false,
        isRecordExternal: true,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result).toMatchObject({
        txId: 100,
        note: 'External note',
        paymentType: PAYMENT_TYPES.creditCard,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      });
      // External records cannot update these fields
      expect(result.amount).toBeUndefined();
      expect(result.time).toBeUndefined();
      expect(result.transactionType).toBeUndefined();
      expect(result.accountId).toBeUndefined();
    });
  });

  describe('transfer updates', () => {
    it('updates to transfer without linked transaction', () => {
      const transaction = createMockTransaction();
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        toAccount: createMockAccount({ id: 2 }),
        targetAmount: 150,
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: null,
        isTransferTx: true,
        isRecordExternal: false,
        isCurrenciesDifferent: true,
        isOriginalRefundsOverriden: false,
      });

      expect(result).toMatchObject({
        destinationAccountId: 2,
        destinationAmount: 150,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      });
    });

    it('updates with linked transaction', () => {
      const transaction = createMockTransaction();
      const linkedTx = createMockTransaction({ id: 200 });
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        toAccount: createMockAccount({ id: 2 }),
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: linkedTx,
        isTransferTx: true,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result).toMatchObject({
        destinationTransactionId: 200,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      });
      expect(result.destinationAccountId).toBeUndefined();
      expect(result.destinationAmount).toBeUndefined();
    });
  });

  describe('out of wallet updates', () => {
    it('handles update to out of wallet destination', () => {
      const transaction = createMockTransaction();
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        account: createMockAccount({ id: 1 }),
        toAccount: OUT_OF_WALLET_ACCOUNT_MOCK,
        amount: 100,
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: null,
        isTransferTx: true,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result).toMatchObject({
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        transactionType: TRANSACTION_TYPES.expense,
      });
    });

    it('handles update from out of wallet source', () => {
      const transaction = createMockTransaction({
        transactionType: TRANSACTION_TYPES.expense,
      });
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        account: OUT_OF_WALLET_ACCOUNT_MOCK,
        toAccount: createMockAccount({ id: 2 }),
        targetAmount: 100,
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: null,
        isTransferTx: true,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result).toMatchObject({
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        transactionType: TRANSACTION_TYPES.income,
        accountId: 2,
        amount: 100,
      });
    });
  });

  describe('refund updates', () => {
    it('sets refundsTxId when refundsTx is provided and overriden', () => {
      const transaction = createMockTransaction();
      const refundTx = createMockTransaction({ id: 50 });
      const form = createBaseForm({
        refundsTx: refundTx,
        refundedByTxs: null,
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: null,
        isTransferTx: false,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: true,
      });

      expect(result.refundsTxId).toBe(50);
    });

    it('sets refundedByTxIds when refundedByTxs is provided and overriden', () => {
      const transaction = createMockTransaction();
      const refundTx1 = createMockTransaction({ id: 51 });
      const refundTx2 = createMockTransaction({ id: 52 });
      const form = createBaseForm({
        refundsTx: null,
        refundedByTxs: [refundTx1, refundTx2],
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: null,
        isTransferTx: false,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: true,
      });

      expect(result.refundedByTxIds).toEqual([51, 52]);
    });

    it('clears refundsTxId when set to null', () => {
      const transaction = createMockTransaction();
      const form = createBaseForm({
        refundsTx: null,
        refundedByTxs: undefined,
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: null,
        isTransferTx: false,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: true,
      });

      expect(result.refundsTxId).toBeNull();
    });

    it('clears refundedByTxIds when set to null', () => {
      const transaction = createMockTransaction();
      const form = createBaseForm({
        refundsTx: undefined,
        refundedByTxs: null,
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: null,
        isTransferTx: false,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: true,
      });

      expect(result.refundedByTxIds).toBeNull();
    });

    it('does not include refund fields when not overriden', () => {
      const transaction = createMockTransaction();
      const refundTx = createMockTransaction({ id: 50 });
      const form = createBaseForm({
        refundsTx: refundTx,
      });

      const result = prepareTxUpdationParams({
        form,
        transaction,
        linkedTransaction: null,
        isTransferTx: false,
        isRecordExternal: false,
        isCurrenciesDifferent: false,
        isOriginalRefundsOverriden: false,
      });

      expect(result.refundsTxId).toBeUndefined();
      expect(result.refundedByTxIds).toBeUndefined();
    });
  });
});
