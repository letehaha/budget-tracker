import { PAYMENT_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import {
  interpretBudgetBakersWalletType,
  isBudgetBakersWalletTransferCategory,
  mapBudgetBakersWalletPaymentType,
} from './localized-values';

describe('budget-bakers-wallet localized-values', () => {
  describe('interpretBudgetBakersWalletType', () => {
    it('maps English type values', () => {
      expect(interpretBudgetBakersWalletType({ raw: 'Expense' })).toBe('Expense');
      expect(interpretBudgetBakersWalletType({ raw: 'Income' })).toBe('Income');
    });

    it('maps Spanish type values', () => {
      expect(interpretBudgetBakersWalletType({ raw: 'Gasto' })).toBe('Expense');
      expect(interpretBudgetBakersWalletType({ raw: 'Ingreso' })).toBe('Income');
    });

    it('is case- and whitespace-insensitive', () => {
      expect(interpretBudgetBakersWalletType({ raw: '  gasto ' })).toBe('Expense');
      expect(interpretBudgetBakersWalletType({ raw: 'INGRESO' })).toBe('Income');
    });

    it('returns null for an unsupported-language or unknown value', () => {
      expect(interpretBudgetBakersWalletType({ raw: 'Ausgabe' })).toBeNull(); // German
      expect(interpretBudgetBakersWalletType({ raw: 'Savings' })).toBeNull();
      expect(interpretBudgetBakersWalletType({ raw: '' })).toBeNull();
    });
  });

  describe('mapBudgetBakersWalletPaymentType', () => {
    it('maps English cash / credit card', () => {
      expect(mapBudgetBakersWalletPaymentType({ raw: 'Cash' })).toBe(PAYMENT_TYPES.cash);
      expect(mapBudgetBakersWalletPaymentType({ raw: 'Credit card' })).toBe(PAYMENT_TYPES.creditCard);
    });

    it('maps Spanish cash / credit card (accent-insensitive)', () => {
      expect(mapBudgetBakersWalletPaymentType({ raw: 'Efectivo' })).toBe(PAYMENT_TYPES.cash);
      expect(mapBudgetBakersWalletPaymentType({ raw: 'Tarjeta de crédito' })).toBe(PAYMENT_TYPES.creditCard);
      // The same value without the accent must still match.
      expect(mapBudgetBakersWalletPaymentType({ raw: 'Tarjeta de credito' })).toBe(PAYMENT_TYPES.creditCard);
    });

    it('falls back to bankTransfer for every other value', () => {
      expect(mapBudgetBakersWalletPaymentType({ raw: 'Transferencia bancaria' })).toBe(PAYMENT_TYPES.bankTransfer);
      expect(mapBudgetBakersWalletPaymentType({ raw: 'Tarjeta de débito' })).toBe(PAYMENT_TYPES.bankTransfer);
      expect(mapBudgetBakersWalletPaymentType({ raw: 'Transfer' })).toBe(PAYMENT_TYPES.bankTransfer);
      expect(mapBudgetBakersWalletPaymentType({ raw: '' })).toBe(PAYMENT_TYPES.bankTransfer);
    });
  });

  describe('isBudgetBakersWalletTransferCategory', () => {
    it('recognizes the English and Spanish transfer markers', () => {
      expect(isBudgetBakersWalletTransferCategory({ raw: 'Transfer, withdraw' })).toBe(true);
      expect(isBudgetBakersWalletTransferCategory({ raw: 'Transferir, retirar' })).toBe(true);
    });

    it('is case- and accent-insensitive', () => {
      expect(isBudgetBakersWalletTransferCategory({ raw: 'transferir, retirar' })).toBe(true);
    });

    it('returns false for a real category', () => {
      expect(isBudgetBakersWalletTransferCategory({ raw: 'Groceries' })).toBe(false);
      expect(isBudgetBakersWalletTransferCategory({ raw: 'Compras' })).toBe(false);
      expect(isBudgetBakersWalletTransferCategory({ raw: '' })).toBe(false);
    });
  });
});
