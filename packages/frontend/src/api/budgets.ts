import { api } from '@/api/_api';
import { BudgetModel } from '@bt/shared/types';

import type { StatsResponse } from '../../../backend/src/services/budgets/stats';
import { fromSystemAmount, toSystemAmount } from './helpers';

interface editBudgetParamsParams {
  name?: string;
  limitAmount?: number;
}

export const loadSystemBudgets = async (): Promise<BudgetModel[]> => {
  const result = await api.get('/budgets');

  const updatedResult = result.map((budget: BudgetModel) => {
    if (budget.limitAmount) {
      return {
        ...budget,
        limitAmount: fromSystemAmount(Number(budget.limitAmount)),
      };
    }
    return budget;
  });

  return updatedResult;
};

export const loadBudgetById = async (id: number): Promise<BudgetModel> => {
  const result = await api.get(`/budgets/${id}`);

  if (result.limitAmount) result.limitAmount = fromSystemAmount(Number(result.limitAmount));

  return result;
};

export const createBudget = async (payload: Omit<BudgetModel, 'id' | 'userId'>): Promise<BudgetModel> => {
  const params = payload;

  if (params.limitAmount > 0) {
    params.limitAmount = toSystemAmount(Number(params.limitAmount));
  } else {
    params.limitAmount = null;
  }
  const result = await api.post('/budgets', params);

  return result;
};

export const deleteBudget = async (budgetId: number) => api.delete(`/budgets/${budgetId}`);

export const editBudget = async ({ budgetId, payload }: { budgetId: number; payload: editBudgetParamsParams }) => {
  const params = payload;

  if (params.limitAmount) params.limitAmount = toSystemAmount(Number(params.limitAmount));

  await api.put(`/budgets/${budgetId}`, params);
};

export const addTransactionsToBudget = async (budgetId: number, params: unknown) =>
  api.post(`/budgets/${budgetId}/transactions`, params);

export const removeTransactionsFromBudget = async ({
  budgetId,
  payload,
}: {
  budgetId: number;
  payload: { transactionIds: number[] };
}) => api.delete(`/budgets/${budgetId}/transactions`, payload);

export const loadBudgetStats = async ({ budgetId }: { budgetId: number }): Promise<StatsResponse> => {
  const data: StatsResponse = await api.get(`/budgets/${budgetId}/stats`);

  data.summary.actualExpense = fromSystemAmount(data.summary.actualExpense);
  data.summary.actualIncome = fromSystemAmount(data.summary.actualIncome);
  data.summary.balance = fromSystemAmount(data.summary.balance);

  return data;
};
