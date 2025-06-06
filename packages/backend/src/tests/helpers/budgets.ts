import { BudgetModel } from '@bt/shared/types';
import addTransactionsToBudget from '@controllers/budgets/add-transaction-to-budget';
import removeTransactionsFromBudget from '@controllers/budgets/remove-transaction-from-budget';
import * as getBudgetService from '@root/services/budget.service';
import * as createBudgetService from '@root/services/budgets/create-budget';
import { Response } from 'express';

import { makeRequest } from './common';

interface TestCreateBudgetPayload {
  id?: number;
  name: string;
  status?: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  autoInclude?: boolean;
  limitAmount?: number | null;
}

interface EditBudgetPayload {
  name?: string;
  startDate?: string;
  endDate?: string;
  limitAmount?: number;
  autoInclude?: boolean;
}

interface linkTransactionToBudgetPayload {
  transactionIds: number[];
}

export async function createCustomBudget<R extends boolean | undefined = undefined>({
  raw,
  ...payload
}: TestCreateBudgetPayload & { raw?: R }) {
  return makeRequest<Awaited<ReturnType<typeof createBudgetService.createBudget>>, R>({
    method: 'post',
    url: '/budgets',
    payload,
    raw,
  });
}

export async function getCustomBudgets<R extends boolean | undefined = undefined>({
  raw,
}: {
  raw?: R;
} = {}) {
  return makeRequest<BudgetModel[], R>({
    method: 'get',
    url: '/budgets',
    raw,
  });
}

export async function getCustomBudgetById<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: number;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof getBudgetService.getBudgetById>>, R>({
    method: 'get',
    url: `/budgets/${id}`,
    raw,
  });
}

export async function deleteCustomBudget<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: number;
  raw?: R;
}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'delete',
    url: `/budgets/${id}`,
    raw,
  });
}

export async function editCustomBudget({
  id,
  params,
  raw,
}: {
  id: number;
  params: EditBudgetPayload;
  raw?: false;
}): Promise<Response>;
export async function editCustomBudget({
  id,
  params,
  raw,
}: {
  id: number;
  params: EditBudgetPayload;
  raw?: true;
}): Promise<BudgetModel>;
export async function editCustomBudget({
  id,
  params,
  raw = true,
}: {
  id: number;
  params: EditBudgetPayload;
  raw?: boolean;
}): Promise<Response | BudgetModel> {
  const result = await makeRequest({
    method: 'put',
    url: `/budgets/${id}`,
    payload: params,
    raw,
  });

  return result;
}

export async function addTransactionToCustomBudget<R extends boolean | undefined = undefined>({
  id,
  payload,
  raw,
}: {
  id: number;
  payload: linkTransactionToBudgetPayload;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof addTransactionsToBudget.handler>> | null, R>({
    method: 'post',
    url: `/budgets/${id}/transactions`,
    payload,
    raw,
  });
}

export async function removeTransactionFromCustomBudget<R extends boolean | undefined = undefined>({
  id,
  payload,
  raw,
}: {
  id: number;
  payload: linkTransactionToBudgetPayload;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof removeTransactionsFromBudget.handler>> | null, R>({
    method: 'delete',
    url: `/budgets/${id}/transactions`,
    payload,
    raw,
  });
}
