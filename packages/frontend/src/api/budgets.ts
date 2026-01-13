import { api } from '@/api/_api';
import { BudgetModel } from '@bt/shared/types';

interface editBudgetParamsParams {
  name?: string;
  limitAmount?: number;
}

// Backend now returns decimals directly, no conversion needed
export const loadSystemBudgets = async (): Promise<BudgetModel[]> => {
  return api.get('/budgets');
};

export const loadBudgetById = async (id: number): Promise<BudgetModel> => {
  return api.get(`/budgets/${id}`);
};

export const createBudget = async (payload: Omit<BudgetModel, 'id' | 'userId'>): Promise<BudgetModel> => {
  // Backend accepts decimals directly
  const params = {
    ...payload,
    limitAmount: payload.limitAmount && payload.limitAmount > 0 ? payload.limitAmount : null,
  };
  return api.post('/budgets', params);
};

export const deleteBudget = async (budgetId: number) => api.delete(`/budgets/${budgetId}`);

export const editBudget = async ({ budgetId, payload }: { budgetId: number; payload: editBudgetParamsParams }) => {
  // Backend accepts decimals directly
  await api.put(`/budgets/${budgetId}`, payload);
};

export const addTransactionsToBudget = async (budgetId: number, params: unknown) =>
  api.post(`/budgets/${budgetId}/transactions`, params);

export const removeTransactionsFromBudget = async ({
  budgetId,
  payload,
}: {
  budgetId: number;
  payload: { transactionIds: number[] };
}) => api.delete(`/budgets/${budgetId}/transactions`, { data: payload });

interface StatsResponse {
  summary: {
    actualIncome: number;
    actualExpense: number;
    balance: number; // Net difference
    utilizationRate: null | number; // Percentage used (0-100)
    transactionsCount: number;
    firstTransactionDate: string | null; // ISO date string of earliest transaction
    lastTransactionDate: string | null; // ISO date string of latest transaction
  };
}

// Backend now returns decimals directly, no conversion needed
export const loadBudgetStats = async ({ budgetId }: { budgetId: number }): Promise<StatsResponse> => {
  return api.get(`/budgets/${budgetId}/stats`);
};
