import { api } from '@/api/_api';
import { fromSystemAmount, toSystemAmount } from '@/api/helpers';
import { TransactionModel } from '@bt/shared/types/db-models';
import * as endpointsTypes from '@bt/shared/types/endpoints';
import { ACCOUNT_TYPES, SORT_DIRECTIONS, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types/enums';

export const formatTransactionResponse = (transaction: TransactionModel): TransactionModel => ({
  ...transaction,
  amount: fromSystemAmount(transaction.amount),
  refAmount: fromSystemAmount(transaction.refAmount),
  cashbackAmount: fromSystemAmount(transaction.cashbackAmount),
  refCommissionRate: fromSystemAmount(transaction.refCommissionRate),
  commissionRate: fromSystemAmount(transaction.commissionRate),
});

export const formatTransactionPayload = <
  T extends endpointsTypes.CreateTransactionBody | endpointsTypes.UpdateTransactionBody,
>(
  transaction: T,
): T => {
  const params = { ...transaction };
  const timeFieldsToPatch = ['time', 'budgetId', 'startDate', 'endDate'];

  timeFieldsToPatch.forEach((field) => {
    if (params[field]) params[field] = new Date(params[field]).toISOString();
  });

  const amountFieldsToPatch = ['amount', 'destinationAmount', 'amountLte', 'amountGte'];

  amountFieldsToPatch.forEach((field) => {
    if (params[field]) params[field] = toSystemAmount(Number(params[field]));
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
  sort?: SORT_DIRECTIONS;
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
  excludeTransfer?: boolean;
  excludeRefunds?: boolean;
  startDate?: string;
  endDate?: string;
  amountLte?: number;
  amountGte?: number;
}): Promise<endpointsTypes.GetTransactionsResponse> => {
  const result = await api.get('/transactions', formatTransactionPayload(params));

  return result.map((item) => formatTransactionResponse(item));
};

export const loadTransactionById = async ({ id }: { id: number }): Promise<TransactionModel> => {
  const result = await api.get(`/transactions/${id}`);

  return formatTransactionResponse(result);
};

export const loadTransactionsByTransferId = async (transferId: string): Promise<TransactionModel[]> => {
  const result = await api.get(`/transactions/transfer/${transferId}`);

  return result.map((item) => formatTransactionResponse(item));
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
  const result = await api.get(`/transactions/budget/${budgetId}`);

  return result.map((item) => formatTransactionResponse(item));
};
