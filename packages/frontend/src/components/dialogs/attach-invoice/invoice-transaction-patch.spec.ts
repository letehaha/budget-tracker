import { type ExtractedInvoice, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { buildInvoiceTransactionPatch } from './invoice-transaction-patch';

const invoice: ExtractedInvoice = {
  transactionType: TRANSACTION_TYPES.expense,
  vendorName: 'Hetzner Online GmbH',
  customerName: null,
  totalAmount: 47.48,
  currencyCode: 'EUR',
  issueDate: '2026-09-17',
  invoiceNumber: 'R0024817395',
  invoiceUrl: 'https://accounts.hetzner.com/invoice/R0024817395',
};

const emptyTransaction = {
  externalReference: null,
  externalUrl: null,
  originalAmount: null,
  currencyCode: 'USD',
  transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
};

describe('buildInvoiceTransactionPatch', () => {
  it('fills every empty field from the invoice', () => {
    expect(buildInvoiceTransactionPatch({ invoice, transaction: emptyTransaction })).toEqual({
      externalReference: 'R0024817395',
      externalUrl: 'https://accounts.hetzner.com/invoice/R0024817395',
      originalAmount: 47.48,
      originalCurrencyCode: 'EUR',
    });
  });

  it('never overrides values the transaction already has', () => {
    const patch = buildInvoiceTransactionPatch({
      invoice,
      transaction: {
        ...emptyTransaction,
        externalReference: 'BANK-REF-1',
        externalUrl: 'https://bank.example/tx/1',
        originalAmount: 50,
      },
    });

    expect(patch).toEqual({});
  });

  it('skips the original amount when the invoice is in the account currency', () => {
    const patch = buildInvoiceTransactionPatch({
      invoice,
      transaction: { ...emptyTransaction, currencyCode: 'EUR' },
    });

    expect(patch.originalAmount).toBeUndefined();
    expect(patch.originalCurrencyCode).toBeUndefined();
  });

  it('skips the original amount on a transfer leg, which the update endpoint rejects', () => {
    const patch = buildInvoiceTransactionPatch({
      invoice,
      transaction: { ...emptyTransaction, transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer },
    });

    expect(patch.originalAmount).toBeUndefined();
    expect(patch.originalCurrencyCode).toBeUndefined();
    expect(patch.externalReference).toBe('R0024817395');
  });

  it('truncates an over-long invoice number to the column length', () => {
    const patch = buildInvoiceTransactionPatch({
      invoice: { ...invoice, invoiceNumber: 'X'.repeat(300) },
      transaction: emptyTransaction,
    });

    expect(patch.externalReference).toHaveLength(255);
  });

  it('skips fields the invoice does not have', () => {
    const patch = buildInvoiceTransactionPatch({
      invoice: { ...invoice, invoiceNumber: null, invoiceUrl: null },
      transaction: { ...emptyTransaction, currencyCode: 'EUR' },
    });

    expect(patch).toEqual({});
  });
});
