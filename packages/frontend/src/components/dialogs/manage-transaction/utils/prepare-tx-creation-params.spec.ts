import { OUT_OF_WALLET_ACCOUNT_MOCK } from '@/common/const';
import type { FormattedCategory } from '@/common/types';
import {
  ACCOUNT_CATEGORIES,
  type AccountModel,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  type TransactionModel,
  type RecordId,
} from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { FORM_TYPES, UI_FORM_STRUCT } from '../types';
import { prepareTxCreationParams } from './prepare-tx-creation-params';

const createMockAccount = (overrides: Partial<AccountModel> = {}): AccountModel =>
  ({
    id: '00000000-0000-0000-0000-000000000001' as RecordId,
    name: 'Test Account',
    currencyCode: 'USD',
    currentBalance: 1000,
    ...overrides,
  }) as AccountModel;

const createMockCategory = (overrides: Partial<FormattedCategory> = {}): FormattedCategory =>
  ({
    id: '00000000-0000-0000-0000-000000000001' as RecordId,
    name: 'Test Category',
    subCategories: [],
    ...overrides,
  }) as FormattedCategory;

const createMockTransaction = (overrides: Partial<TransactionModel> = {}): TransactionModel =>
  ({
    id: '00000000-0000-0000-0000-000000000100' as RecordId,
    amount: 500,
    accountId: '00000000-0000-0000-0000-000000000001' as RecordId,
    categoryId: '00000000-0000-0000-0000-000000000001' as RecordId,
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
        accountId: '00000000-0000-0000-0000-000000000001' as RecordId,
        categoryId: '00000000-0000-0000-0000-000000000001' as RecordId,
        // Always present: an explicit `tagIds` (even empty) tells the backend
        // the client already computed the final tag set, so it skips
        // auto-applying the payee's default tags.
        tagIds: [],
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
        categoryId: '00000000-0000-0000-0000-000000000001' as RecordId,
      });
    });
  });

  describe('transfer transactions', () => {
    it('creates transfer with same currency', () => {
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        toAccount: createMockAccount({
          id: '00000000-0000-0000-0000-000000000002' as RecordId,
          name: 'Destination Account',
        }),
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: true,
        isCurrenciesDifferent: false,
      });

      expect(result).toMatchObject({
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAccountId: '00000000-0000-0000-0000-000000000002',
        destinationAmount: 100,
      });
      expect(result.categoryId).toBeUndefined();
    });

    it('creates transfer with different currencies', () => {
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        toAccount: createMockAccount({ id: '00000000-0000-0000-0000-000000000002' as RecordId, currencyCode: 'EUR' }),
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

    it('stamps transfer_to_loan when the destination is a loan-category account', () => {
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        toAccount: createMockAccount({
          id: '00000000-0000-0000-0000-000000000002' as RecordId,
          name: 'Loan Account',
          accountCategory: ACCOUNT_CATEGORIES.loan,
        }),
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: true,
        isCurrenciesDifferent: false,
      });

      expect(result).toMatchObject({
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
        destinationAccountId: '00000000-0000-0000-0000-000000000002',
        destinationAmount: 100,
      });
    });

    it('stamps common_transfer when the destination is not a loan-category account', () => {
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        toAccount: createMockAccount({
          id: '00000000-0000-0000-0000-000000000002' as RecordId,
          accountCategory: ACCOUNT_CATEGORIES.general,
        }),
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: true,
        isCurrenciesDifferent: false,
      });

      expect(result.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    });
  });

  describe('out of wallet transfers', () => {
    it('handles "from" account as out of wallet (income)', () => {
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        account: OUT_OF_WALLET_ACCOUNT_MOCK,
        toAccount: createMockAccount({ id: '00000000-0000-0000-0000-000000000002' as RecordId }),
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
        accountId: '00000000-0000-0000-0000-000000000002' as RecordId,
        amount: 100,
      });
      expect(result.destinationAccountId).toBeUndefined();
      expect(result.destinationAmount).toBeUndefined();
    });

    it('handles "to" account as out of wallet (expense)', () => {
      const form = createBaseForm({
        type: FORM_TYPES.transfer,
        account: createMockAccount({ id: '00000000-0000-0000-0000-000000000001' as RecordId }),
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
        accountId: '00000000-0000-0000-0000-000000000001' as RecordId,
        amount: 100,
      });
      expect(result.destinationAccountId).toBeUndefined();
      expect(result.destinationAmount).toBeUndefined();
    });
  });

  describe('refund transactions', () => {
    // An expense form refunds an income original (opposite type), which is the only
    // shape the backend accepts.
    it('includes refundForTxId when refundsTx is an opposite-type link', () => {
      const refundedTransaction = createMockTransaction({
        id: '00000000-0000-0000-0000-000000000050' as RecordId,
        transactionType: TRANSACTION_TYPES.income,
      });
      const form = createBaseForm({
        type: FORM_TYPES.expense,
        refundsTx: { transaction: refundedTransaction },
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: false,
        isCurrenciesDifferent: false,
      });

      expect(result.refundForTxId).toBe('00000000-0000-0000-0000-000000000050');
    });

    it('includes refundForSplitId when refundsTx has splitId', () => {
      const refundedTransaction = createMockTransaction({
        id: '00000000-0000-0000-0000-000000000050' as RecordId,
        transactionType: TRANSACTION_TYPES.income,
      });
      const form = createBaseForm({
        type: FORM_TYPES.expense,
        refundsTx: {
          transaction: refundedTransaction,
          splitId: 'split-uuid-123',
        },
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: false,
        isCurrenciesDifferent: false,
      });

      expect(result.refundForTxId).toBe('00000000-0000-0000-0000-000000000050');
      expect(result.refundForSplitId).toBe('split-uuid-123');
    });

    it('does not include refundForSplitId when refundsTx has no splitId', () => {
      const refundedTransaction = createMockTransaction({
        id: '00000000-0000-0000-0000-000000000050' as RecordId,
        transactionType: TRANSACTION_TYPES.income,
      });
      const form = createBaseForm({
        type: FORM_TYPES.expense,
        refundsTx: { transaction: refundedTransaction },
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: false,
        isCurrenciesDifferent: false,
      });

      expect(result.refundForTxId).toBe('00000000-0000-0000-0000-000000000050');
      expect(result.refundForSplitId).toBeUndefined();
    });

    it('includes refundForTxId for an income form refunding an expense original', () => {
      const refundedTransaction = createMockTransaction({
        id: '00000000-0000-0000-0000-000000000050' as RecordId,
        transactionType: TRANSACTION_TYPES.expense,
      });
      const form = createBaseForm({
        type: FORM_TYPES.income,
        refundsTx: { transaction: refundedTransaction },
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: false,
        isCurrenciesDifferent: false,
      });

      expect(result.refundForTxId).toBe('00000000-0000-0000-0000-000000000050');
    });

    // Defense-in-depth: a stale same-type link left over from a type toggle must never
    // reach the API, since the backend rejects it with a 422.
    it('omits refundForTxId when the linked transaction has the same type as the form', () => {
      const refundedTransaction = createMockTransaction({
        id: '00000000-0000-0000-0000-000000000050' as RecordId,
        transactionType: TRANSACTION_TYPES.expense,
      });
      const form = createBaseForm({
        type: FORM_TYPES.expense,
        refundsTx: { transaction: refundedTransaction },
      });

      const result = prepareTxCreationParams({
        form,
        isTransferTx: false,
        isCurrenciesDifferent: false,
      });

      expect(result.refundForTxId).toBeUndefined();
      expect(result.refundForSplitId).toBeUndefined();
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
