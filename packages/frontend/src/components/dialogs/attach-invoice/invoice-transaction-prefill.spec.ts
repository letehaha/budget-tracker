import { FORM_TYPES } from '@/components/dialogs/manage-transaction/types';
import { type AccountModel, type CurrencyModel, type ExtractedInvoice, TRANSACTION_TYPES } from '@bt/shared/types';
import { parseISO } from 'date-fns';
import { describe, expect, it } from 'vitest';

import { buildInvoiceTransactionPrefill } from './invoice-transaction-prefill';

const invoice: ExtractedInvoice = {
  transactionType: TRANSACTION_TYPES.expense,
  vendorName: 'Acme Cloud Services',
  customerName: 'Northwind Studio',
  totalAmount: 100,
  currencyCode: 'EUR',
  issueDate: '2026-06-10',
  invoiceNumber: null,
  invoiceUrl: null,
};

const account = ({ id, currencyCode }: { id: string; currencyCode: string }) => ({ id, currencyCode }) as AccountModel;

const usd = account({ id: 'usd', currencyCode: 'USD' });
const eur = account({ id: 'eur', currencyCode: 'EUR' });

const convert = ({ amount, from, to }: { amount: number; from: string; to: string }) =>
  from === to ? amount : amount * 2;

describe('buildInvoiceTransactionPrefill', () => {
  it('picks the account in the invoice currency over the default one', () => {
    const prefill = buildInvoiceTransactionPrefill({ invoice, accounts: [usd, eur], defaultAccount: usd, convert });

    expect(prefill).toEqual({
      type: FORM_TYPES.expense,
      account: eur,
      amount: 100,
      time: parseISO('2026-06-10'),
      note: 'Acme Cloud Services',
      originalAmount: null,
      originalCurrency: null,
    });
  });

  it('reads the issue date as local midnight, not UTC', () => {
    const { time } = buildInvoiceTransactionPrefill({ invoice, accounts: [eur], defaultAccount: eur, convert });

    expect([time.getFullYear(), time.getMonth(), time.getDate()]).toEqual([2026, 5, 10]);
  });

  it('prefills an income named after the customer for an invoice the user issued', () => {
    const prefill = buildInvoiceTransactionPrefill({
      invoice: { ...invoice, transactionType: TRANSACTION_TYPES.income },
      accounts: [eur],
      defaultAccount: eur,
      convert,
    });

    expect(prefill.type).toBe(FORM_TYPES.income);
    expect(prefill.note).toBe('Northwind Studio');
  });

  it('takes the invoice total as is when the account currency matches, even with no rates loaded', () => {
    const prefill = buildInvoiceTransactionPrefill({
      invoice,
      accounts: [usd, eur],
      defaultAccount: usd,
      convert: () => null,
    });

    expect(prefill.account).toBe(eur);
    expect(prefill.amount).toBe(100);
  });

  it('converts the total into the default account when no account matches the currency', () => {
    const prefill = buildInvoiceTransactionPrefill({ invoice, accounts: [usd], defaultAccount: usd, convert });

    expect(prefill.account).toBe(usd);
    expect(prefill.amount).toBe(200);
    expect(prefill.originalAmount).toBeNull();
    expect(prefill.originalCurrency).toBeNull();
  });

  it('carries the invoice details and the original pair when the account currency differs', () => {
    const eurCurrency = { code: 'EUR' } as CurrencyModel;
    const detailed = { ...invoice, invoiceNumber: 'INV-1', invoiceUrl: 'https://a.example/inv' };

    const prefill = buildInvoiceTransactionPrefill({
      invoice: detailed,
      accounts: [usd],
      defaultAccount: usd,
      convert,
      currencies: [eurCurrency],
    });

    expect(prefill.externalReference).toBe('INV-1');
    expect(prefill.externalUrl).toBe('https://a.example/inv');
    expect(prefill.originalAmount).toBe(100);
    expect(prefill.originalCurrency).toBe(eurCurrency);

    const same = buildInvoiceTransactionPrefill({ invoice: detailed, accounts: [eur], defaultAccount: eur, convert });
    expect(same.originalAmount).toBeNull();
    expect(same.originalCurrency).toBeNull();
  });

  it('leaves the amount empty when the rate is unknown or there is no account', () => {
    expect(
      buildInvoiceTransactionPrefill({ invoice, accounts: [usd], defaultAccount: usd, convert: () => null }).amount,
    ).toBeNull();
    expect(buildInvoiceTransactionPrefill({ invoice, accounts: [], defaultAccount: null, convert }).amount).toBeNull();
  });
});
