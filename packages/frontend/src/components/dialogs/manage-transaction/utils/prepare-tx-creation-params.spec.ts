import { OUT_OF_WALLET_ACCOUNT_MOCK } from '@/common/const';
import type { FormattedCategory } from '@/common/types';
import {
  type AccountModel,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  type TransactionModel,
} from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { FORM_TYPES, UI_FORM_STRUCT } from '../types';
import { prepareTxCreationParams } from './prepare-tx-creation-params';

const createMockAccount = (overrides: Partial<AccountModel> = {}): AccountModel =>
  ({
    id: 1,
    name: 'Test Account',
    currencyCode: 'USD',
    currentBalance: 1000,
    ...overrides,
  }) as AccountModel;

const createMockCategory = (overrides: Partial<FormattedCategory> = {}): FormattedCategory =>
  ({
    id: 1,
    name: 'Test Category',
    subCategories: [],
    ...overrides,
  }) as FormattedCategory;

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
