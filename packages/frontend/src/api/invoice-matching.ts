import { api } from '@/api/_api';
import type { ExtractedInvoice, InvoiceMatchResult, TRANSACTION_TYPES } from '@bt/shared/types';

export const matchInvoice = async ({
  file,
  transactionType,
}: {
  file: File;
  transactionType: TRANSACTION_TYPES;
}): Promise<InvoiceMatchResult> =>
  api.postRaw({
    endpoint: '/transactions/match-invoice',
    body: file,
    query: { transactionType },
    headers: { 'Content-Type': 'application/octet-stream' },
  });

export const rematchInvoice = async ({ invoice }: { invoice: ExtractedInvoice }): Promise<InvoiceMatchResult> =>
  api.post('/transactions/match-invoice/candidates', invoice);
