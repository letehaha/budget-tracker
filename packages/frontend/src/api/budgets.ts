import { api } from '@/api/_api';
import { BudgetModel, endpointsTypes } from '@bt/shared/types';

interface editBudgetParamsParams {
  name?: string;
  limitAmount?: number;
  categoryIds?: number[];
}

export const loadSystemBudgets = async ({ status }: { status?: string } = {}): Promise<BudgetModel[]> => {
  return api.get('/budgets', status ? { status } : undefined);
};

export const loadBudgetById = async (id: number): Promise<BudgetModel> => {
  return api.get(`/budgets/${id}`);
};

export const createBudget = async (payload: Omit<BudgetModel, 'id' | 'userId'>): Promise<BudgetModel> => {
  const params = {
    ...payload,
    limitAmount: payload.limitAmount && payload.limitAmount > 0 ? payload.limitAmount : null,
  };
  return api.post('/budgets', params);
};

export const deleteBudget = async (budgetId: number) => api.delete(`/budgets/${budgetId}`);

export const archiveBudget = async ({ budgetId, isArchived }: { budgetId: number; isArchived: boolean }) =>
  api.patch(`/budgets/${budgetId}/archive`, { isArchived });

export const editBudget = async ({ budgetId, payload }: { budgetId: number; payload: editBudgetParamsParams }) => {
  await api.put(`/budgets/${budgetId}`, payload);
};

export const addTransactionsToBudget = async (budgetId: number, params: Record<string, unknown>) =>
  api.post(`/budgets/${budgetId}/transactions`, params);

export const removeTransactionsFromBudget = async ({
  budgetId,
  payload,
}: {
  budgetId: number;
  payload: { transactionIds: number[] };
}) => api.delete(`/budgets/${budgetId}/transactions`, { data: payload });

export interface StatsResponse {
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

export const loadBudgetStats = async ({ budgetId }: { budgetId: number }): Promise<StatsResponse> => {
  return api.get(`/budgets/${budgetId}/stats`);
};

export interface CategoryBudgetTransaction {
  id: number;
  time: string;
  transactionType: 'income' | 'expense';
  refAmount: number;
  amount: number;
  note: string | null;
  categoryId: number | null;
  accountId: number;
  effectiveCategory?: {
    id: number;
    name: string;
    color: string;
  };
  effectiveRefAmount?: number;
}

interface CategoryBudgetTransactionsResponse {
  transactions: CategoryBudgetTransaction[];
  total: number;
}

export const loadCategoryBudgetTransactions = async ({
  budgetId,
  from = 0,
  limit = 50,
}: {
  budgetId: number;
  from?: number;
  limit?: number;
}): Promise<CategoryBudgetTransactionsResponse> => {
  return api.get(`/budgets/${budgetId}/category-transactions`, { from, limit });
};

export const loadBudgetSpendingStats = async ({
  budgetId,
}: {
  budgetId: number;
}): Promise<endpointsTypes.BudgetSpendingStatsResponse> => {
  return api.get(`/budgets/${budgetId}/spending-stats`);
};
