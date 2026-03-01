import { api } from '@/api/_api';
import { InvestmentTransactionModel } from '@bt/shared/types';

export interface HoldingTransactionsResponse {
  transactions: InvestmentTransactionModel[];
  total: number;
  limit: number;
  offset: number;
}

export const createInvestmentTransaction = (payload: Record<string, unknown>): Promise<InvestmentTransactionModel> => {
  return api.post('/investments/transaction', payload);
};

/** @public */
export const updateInvestmentTransaction = (
  transactionId: number,
  payload: Record<string, unknown>,
): Promise<InvestmentTransactionModel> => {
  return api.put(`/investments/transaction/${transactionId}`, payload);
};

export const deleteInvestmentTransaction = (transactionId: number): Promise<void> => {
  return api.delete(`/investments/transaction/${transactionId}`);
};

/** @public */
export const getInvestmentTransactions = (portfolioId: number): Promise<InvestmentTransactionModel[]> => {
  return api.get(`/investments/accounts/${portfolioId}/transactions`);
};

export const getHoldingTransactions = (params: {
  portfolioId: number;
  securityId: number;
  limit?: number;
  offset?: number;
}): Promise<HoldingTransactionsResponse> => {
  return api.get('/investments/transactions', { ...params });
};

export const getPortfolioInvestmentTransactions = (params: {
  portfolioId: number;
  limit?: number;
  offset?: number;
}): Promise<HoldingTransactionsResponse> => {
  return api.get('/investments/transactions', { ...params });
};
