import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, type endpointsTypes } from '@bt/shared/types';
import Transactions from '@models/Transactions.model';
import * as transactionsService from '@services/transactions';
import type { getTransactionsByTransferId as apiGetTransactionsByTransferId } from '@services/transactions/get-by-transfer-id';
import type { getTransactions as apiGetTransactions } from '@services/transactions/get-transactions';
import { startOfDay } from 'date-fns';
import { Response } from 'express';

import { createAccount } from './account';
import { CustomResponse, makeRequest } from './common';

type BuildTxPartialField = 'amount' | 'time' | 'transferNature' | 'paymentType' | 'transactionType';
export const buildTransactionPayload = (
  params: Omit<endpointsTypes.CreateTransactionBody, BuildTxPartialField> &
    Partial<Pick<endpointsTypes.CreateTransactionBody, BuildTxPartialField>>,
): endpointsTypes.CreateTransactionBody => ({
  amount: 1000,
  categoryId: 1,
  transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
  paymentType: PAYMENT_TYPES.creditCard,
  time: startOfDay(new Date()).toISOString(),
  transactionType: TRANSACTION_TYPES.expense,
  ...params,
});

interface CreateTransactionBasePayload {
  payload?: ReturnType<typeof buildTransactionPayload>;
}

export async function createTransaction(): Promise<Response>;
export async function createTransaction({
  raw,
  payload,
}: CreateTransactionBasePayload & { raw?: false }): Promise<Response>;
export async function createTransaction({
  raw,
  payload,
}: CreateTransactionBasePayload & { raw?: true }): Promise<[baseTx: Transactions, oppositeTx?: Transactions]>;
export async function createTransaction({
  raw = false,
  payload = undefined,
}: CreateTransactionBasePayload & { raw?: boolean } = {}) {
  let txPayload: ReturnType<typeof buildTransactionPayload> | undefined = payload;

  if (payload === undefined) {
    const account = await createAccount({ raw: true });
    txPayload = buildTransactionPayload({ accountId: account.id });
  }
  return makeRequest({
    method: 'post',
    url: '/transactions',
    payload: txPayload,
    raw,
  });
}

interface SplitInput {
  categoryId: number;
  amount: number;
  note?: string | null;
}

interface UpdateTransactionBasePayload {
  id: number;
  payload?: Omit<Partial<ReturnType<typeof buildTransactionPayload>>, 'splits'> & {
    destinationAmount?: number;
    destinationAccountId?: number;
    destinationTransactionId?: number;
    refundsTxId?: number | null;
    refundedByTxIds?: number[] | null;
    splits?: SplitInput[] | null;
  };
}

export function updateTransaction({
  raw,
  payload,
  id,
}: UpdateTransactionBasePayload & { raw?: false }): Promise<Response>;
export function updateTransaction({
  raw,
  payload,
  id,
}: UpdateTransactionBasePayload & { raw?: true }): Promise<[baseTx: Transactions, oppositeTx?: Transactions]>;
export function updateTransaction({ raw = false, id, payload = {} }) {
  return makeRequest({
    method: 'put',
    url: `/transactions/${id}`,
    payload,
    raw,
  });
}

export function deleteTransaction({ id }: { id?: number } = {}): Promise<Response> {
  return makeRequest({
    method: 'delete',
    url: `/transactions/${id}`,
  });
}

export function getTransactions<R extends boolean | undefined = undefined>({
  raw,
  ...rest
}: Partial<Omit<Parameters<typeof apiGetTransactions>[0], 'userId' | 'noteSearch'>> & {
  raw?: R;
  noteSearch?: string; // comma-separated string
} = {}) {
  return makeRequest<Awaited<ReturnType<typeof apiGetTransactions>>, R>({
    method: 'get',
    url: '/transactions',
    payload: rest,
    raw,
  });
}

export function getTransactionsByTransferId<R extends boolean | undefined = undefined>({
  raw,
  transferId,
}: {
  raw?: R;
  transferId: string;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiGetTransactionsByTransferId>>, R>({
    method: 'get',
    url: `/transactions/transfer/${transferId}`,
    raw,
  });
}

export function unlinkTransferTransactions({
  transferIds,
  raw,
}: {
  transferIds: string[];
  raw?: false;
}): Promise<Response>;
export function unlinkTransferTransactions({
  raw,
  transferIds,
}: {
  transferIds: string[];
  raw?: true;
}): Promise<Transactions[]>;
export function unlinkTransferTransactions({
  raw = false,
  transferIds = [],
}: {
  transferIds: string[];
  raw?: boolean;
}) {
  return makeRequest({
    method: 'put',
    url: '/transactions/unlink',
    payload: {
      transferIds,
    },
    raw,
  });
}

export function linkTransactions({
  payload,
  raw,
}: {
  payload: endpointsTypes.LinkTransactionsBody;
  raw?: false;
}): Promise<Response>;
export function linkTransactions({
  payload,
  raw,
}: {
  payload: endpointsTypes.LinkTransactionsBody;
  raw?: true;
}): ReturnType<typeof transactionsService.linkTransactions>;
export function linkTransactions({ raw = false, payload }) {
  return makeRequest({
    method: 'put',
    url: '/transactions/link',
    payload,
    raw,
  });
}

// Split helpers
export function deleteSplit({ splitId }: { splitId: string }): Promise<CustomResponse<void>> {
  return makeRequest({
    method: 'delete',
    url: `/transactions/splits/${splitId}`,
  });
}
