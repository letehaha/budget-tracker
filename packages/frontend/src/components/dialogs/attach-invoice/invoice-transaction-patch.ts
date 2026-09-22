import { type ExtractedInvoice, TRANSACTION_TRANSFER_NATURE, type TransactionModel } from '@bt/shared/types';

export const MAX_REFERENCE_LENGTH = 255;

type PatchableTransaction = Pick<
  TransactionModel,
  'externalReference' | 'externalUrl' | 'originalAmount' | 'currencyCode' | 'transferNature'
>;

interface InvoiceTransactionPatch {
  externalReference?: string;
  externalUrl?: string;
  originalAmount?: number;
  originalCurrencyCode?: string;
}

/** Invoice details only fill fields the transaction leaves empty; existing values always win. */
export const buildInvoiceTransactionPatch = ({
  invoice,
  transaction,
}: {
  invoice: ExtractedInvoice;
  transaction: PatchableTransaction;
}): InvoiceTransactionPatch => {
  const patch: InvoiceTransactionPatch = {};

  if (!transaction.externalReference && invoice.invoiceNumber) {
    patch.externalReference = invoice.invoiceNumber.slice(0, MAX_REFERENCE_LENGTH);
  }

  if (!transaction.externalUrl && invoice.invoiceUrl) {
    patch.externalUrl = invoice.invoiceUrl;
  }

  // The update endpoint rejects the original amount/currency pair on any transfer leg.
  const acceptsOriginalAmount = transaction.transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer;

  if (
    acceptsOriginalAmount &&
    transaction.originalAmount == null &&
    invoice.currencyCode !== transaction.currencyCode
  ) {
    patch.originalAmount = invoice.totalAmount;
    patch.originalCurrencyCode = invoice.currencyCode;
  }

  return patch;
};
