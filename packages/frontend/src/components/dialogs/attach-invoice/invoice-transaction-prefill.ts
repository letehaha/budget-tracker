import { FORM_TYPES, type TransactionPrefill } from '@/components/dialogs/manage-transaction/types';
import {
  type AccountModel,
  type CurrencyModel,
  type ExtractedInvoice,
  TRANSACTION_TYPES,
  invoiceCounterpartyName,
} from '@bt/shared/types';
import { parseISO } from 'date-fns';

import { MAX_REFERENCE_LENGTH } from './invoice-transaction-patch';

/**
 * An account in the invoice currency takes the total as is — `convert` answers null while the
 * rates are still loading. Without such an account the default one gets the converted total,
 * or an empty amount when no rate is known.
 */
export const buildInvoiceTransactionPrefill = ({
  invoice,
  accounts,
  defaultAccount,
  convert,
  currencies = [],
}: {
  invoice: ExtractedInvoice;
  accounts: AccountModel[];
  defaultAccount: AccountModel | null;
  convert: (params: { amount: number; from: string; to: string }) => number | null;
  currencies?: CurrencyModel[];
}): TransactionPrefill => {
  const account =
    [defaultAccount, ...accounts].find((item) => item?.currencyCode === invoice.currencyCode) ?? defaultAccount;

  const amount = () => {
    if (!account) return null;
    if (account.currencyCode === invoice.currencyCode) return invoice.totalAmount;
    return convert({ amount: invoice.totalAmount, from: invoice.currencyCode, to: account.currencyCode });
  };

  // The original pair reaches the API only complete, so an unknown currency drops both.
  const originalCurrency =
    account && account.currencyCode !== invoice.currencyCode
      ? (currencies.find((currency) => currency.code === invoice.currencyCode) ?? null)
      : null;

  return {
    type: invoice.transactionType === TRANSACTION_TYPES.income ? FORM_TYPES.income : FORM_TYPES.expense,
    account,
    amount: amount(),
    time: parseISO(invoice.issueDate),
    note: invoiceCounterpartyName({ invoice }) ?? '',
    externalReference: invoice.invoiceNumber?.slice(0, MAX_REFERENCE_LENGTH),
    externalUrl: invoice.invoiceUrl ?? undefined,
    originalAmount: originalCurrency ? invoice.totalAmount : null,
    originalCurrency,
  };
};
