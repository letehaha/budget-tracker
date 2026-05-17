import type { TransactionGroupApiResponse } from '@root/serializers/transaction-groups.serializer';

import { makeRequest } from './common';

// Types

export interface CreateTransactionGroupPayload {
  name: string;
  note?: string | null;
  transactionIds: string[];
}

export interface UpdateTransactionGroupPayload {
  name?: string;
  note?: string | null;
}

export interface RemoveTransactionsFromGroupResult {
  group: TransactionGroupApiResponse | null;
  dissolved: boolean;
}

// Helpers

export async function createTransactionGroup<R extends boolean | undefined = undefined>({
  payload,
  raw,
}: {
  payload: CreateTransactionGroupPayload;
  raw?: R;
}) {
  return makeRequest<TransactionGroupApiResponse, R>({
    method: 'post',
    url: '/transaction-groups',
    payload,
    raw,
  });
}

export async function getTransactionGroups<R extends boolean | undefined = undefined>({
  raw,
  includeTransactions,
}: {
  raw?: R;
  includeTransactions?: boolean;
} = {}) {
  return makeRequest<TransactionGroupApiResponse[], R>({
    method: 'get',
    url: '/transaction-groups',
    payload: {
      ...(includeTransactions !== undefined && { includeTransactions: String(includeTransactions) }),
    },
    raw,
  });
}

export async function getTransactionGroupById<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<TransactionGroupApiResponse, R>({
    method: 'get',
    url: `/transaction-groups/${id}`,
    raw,
  });
}

export async function updateTransactionGroup<R extends boolean | undefined = undefined>({
  id,
  payload,
  raw,
}: {
  id: string;
  payload: UpdateTransactionGroupPayload;
  raw?: R;
}) {
  return makeRequest<TransactionGroupApiResponse, R>({
    method: 'put',
    url: `/transaction-groups/${id}`,
    payload,
    raw,
  });
}

export async function deleteTransactionGroup<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'delete',
    url: `/transaction-groups/${id}`,
    raw,
  });
}

export async function addTransactionsToGroup<R extends boolean | undefined = undefined>({
  groupId,
  transactionIds,
  raw,
}: {
  groupId: string;
  transactionIds: string[];
  raw?: R;
}) {
  return makeRequest<TransactionGroupApiResponse, R>({
    method: 'post',
    url: `/transaction-groups/${groupId}/transactions`,
    payload: { transactionIds },
    raw,
  });
}

export async function removeTransactionsFromGroup<R extends boolean | undefined = undefined>({
  groupId,
  transactionIds,
  force,
  raw,
}: {
  groupId: string;
  transactionIds: string[];
  force?: boolean;
  raw?: R;
}) {
  return makeRequest<RemoveTransactionsFromGroupResult, R>({
    method: 'delete',
    url: `/transaction-groups/${groupId}/transactions`,
    payload: { transactionIds, ...(force !== undefined && { force }) },
    raw,
  });
}

// Builder

export function buildTransactionGroupPayload(
  overrides: Partial<CreateTransactionGroupPayload> & { transactionIds: string[] },
): CreateTransactionGroupPayload {
  return {
    name: `Test Group ${Date.now()}`,
    note: null,
    ...overrides,
  };
}
