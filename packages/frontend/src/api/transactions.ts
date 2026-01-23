import { api } from '@/api/_api';
import { TransactionModel } from '@bt/shared/types/db-models';
import * as endpointsTypes from '@bt/shared/types/endpoints';
import { ACCOUNT_TYPES, SORT_DIRECTIONS, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types/enums';

export const formatTransactionPayload = <
  T extends endpointsTypes.CreateTransactionBody | endpointsTypes.UpdateTransactionBody,
>(
  transaction: T,
): T => {
  const params = { ...transaction };
  const timeFieldsToPatch = ['time', 'startDate', 'endDate'];

  timeFieldsToPatch.forEach((field) => {
    if (params[field]) params[field] = new Date(params[field]).toISOString();
  });

  return params;
};

export const loadTransactions = async (params: {
  from: number;
  limit?: number;
  budgetIds?: number[];
  excludedBudgetIds?: number[];
  accountType?: ACCOUNT_TYPES;
  transactionType?: TRANSACTION_TYPES;
  accountIds?: number[];
  categoryIds?: number[];
  tagIds?: number[];
  excludedTagIds?: number[];
  sort?: SORT_DIRECTIONS;
  excludeTransfer?: boolean;
  excludeRefunds?: boolean;
  startDate?: string;
  endDate?: string;
  amountLte?: number;
  amountGte?: number;
  includeSplits?: boolean;
  includeTags?: boolean;
}): Promise<endpointsTypes.GetTransactionsResponse> => {
  return api.get('/transactions', formatTransactionPayload(params));
};

export const loadTransactionById = async ({
  id,
  includeSplits,
  includeTags,
}: {
  id: number;
  includeSplits?: boolean;
  includeTags?: boolean;
}): Promise<TransactionModel> => {
  return api.get(`/transactions/${id}`, { includeSplits, includeTags });
};

export const loadTransactionsByTransferId = async (transferId: string): Promise<TransactionModel[]> => {
  return api.get(`/transactions/transfer/${transferId}`);
};

export const createTransaction = async (params: endpointsTypes.CreateTransactionBody) => {
  const formattedParams = formatTransactionPayload({
    transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    note: '',
    ...params,
  });

  return api.post('/transactions', formattedParams);
};

export const editTransaction = async ({
  txId,
  ...rest
}: endpointsTypes.UpdateTransactionBody & { txId: number }): Promise<void> => {
  const params = formatTransactionPayload(rest);

  await api.put(`/transactions/${txId}`, params);
};

export const deleteTransaction = async (txId: number): Promise<void> => {
  await api.delete(`/transactions/${txId}`);
};

export const linkTransactions = async (payload: endpointsTypes.LinkTransactionsBody): Promise<void> => {
  await api.put('/transactions/link', payload);
};

export const unlinkTransactions = async (payload: endpointsTypes.UnlinkTransferTransactionsBody): Promise<void> => {
  await api.put('/transactions/unlink', payload);
};

export const getTransactionByBudgetId = async (budgetId: number): Promise<TransactionModel[]> => {
  return api.get(`/transactions/budget/${budgetId}`);
};

export const bulkUpdateTransactions = async (
  payload: endpointsTypes.BulkUpdateTransactionsBody,
): Promise<endpointsTypes.BulkUpdateTransactionsResponse> => {
  return api.put('/transactions/bulk', payload);
};

// Backward compatibility alias
export const bulkUpdateTransactionsCategory = bulkUpdateTransactions;

export const loadRefundRecommendations = async (
  params: { transactionId: number } | { transactionType: TRANSACTION_TYPES; originAmount: number; accountId: number },
): Promise<endpointsTypes.GetRefundRecommendationsResponse> => {
  return api.get('/transactions/refund-recommendations', params);
};

export const loadTransferRecommendations = async (
  params: { transactionId: number } | { transactionType: TRANSACTION_TYPES; originAmount: number; accountId: number },
): Promise<endpointsTypes.GetTransferRecommendationsResponse> => {
  return api.get('/transactions/transfer-recommendations', params);
};
