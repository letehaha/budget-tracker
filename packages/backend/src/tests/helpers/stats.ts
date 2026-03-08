import { BalanceModel, endpointsTypes } from '@bt/shared/types';
import {
  getCombinedBalanceHistory as _getCombinedBalanceHistory,
  getEarliestTransactionDate as _getEarliestTransactionDate,
} from '@root/services/stats';
import * as helpers from '@tests/helpers';

export async function getBalanceHistory<R extends boolean | undefined = undefined>({
  from,
  to,
  accountId,
  raw,
}: {
  from?: string;
  to?: string;
  accountId?: number;
  raw?: R;
} = {}) {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  if (accountId) params.append('accountId', accountId.toString());

  const result = await helpers.makeRequest<BalanceModel[], R>({
    method: 'get',
    url: `/stats/balance-history${params.toString() ? `?${params.toString()}` : ''}`,
    raw,
  });

  return result;
}

export const getSpendingsByCategories = async ({
  raw = false,
  from,
  to,
}: { raw?: boolean; from?: string; to?: string } = {}) => {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);

  const result = await helpers.makeRequest({
    method: 'get',
    url: `/stats/spendings-by-categories${params.toString() ? `?${params.toString()}` : ''}`,
  });

  return raw ? helpers.extractResponse(result) : result;
};

export async function getExpensesAmountForPeriod<R extends boolean | undefined = undefined>({
  from,
  to,
  raw,
}: {
  from?: string;
  to?: string;
  raw?: R;
}) {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);

  const result = await helpers.makeRequest<number, R>({
    method: 'get',
    url: `/stats/expenses-amount-for-period${params.toString() ? `?${params.toString()}` : ''}`,
    raw,
  });

  return result;
}

export async function getEarliestTransactionDate<R extends boolean | undefined = undefined>({
  raw,
}: {
  raw?: R;
} = {}) {
  const result = await helpers.makeRequest<Awaited<ReturnType<typeof _getEarliestTransactionDate>>, R>({
    method: 'get',
    url: '/stats/earliest-transaction-date',
    raw,
  });

  return result;
}

export async function getCashFlow<R extends boolean | undefined = undefined>({
  from,
  to,
  granularity,
  excludeCategories,
  categoryIds,
  raw,
}: {
  from: string;
  to: string;
  granularity: endpointsTypes.CashFlowGranularity;
  excludeCategories?: boolean;
  categoryIds?: number[];
  raw?: R;
}) {
  const params = new URLSearchParams();
  params.append('from', from);
  params.append('to', to);
  params.append('granularity', granularity);
  if (excludeCategories !== undefined) params.append('excludeCategories', String(excludeCategories));
  if (categoryIds && categoryIds.length > 0) params.append('categoryIds', categoryIds.join(','));

  const result = await helpers.makeRequest<endpointsTypes.GetCashFlowResponse, R>({
    method: 'get',
    url: `/stats/cash-flow?${params.toString()}`,
    raw,
  });

  return result;
}

export async function getCombinedBalanceHistory<R extends boolean | undefined = undefined>({
  from,
  to,
  raw,
}: {
  from?: string;
  to?: string;
  raw?: R;
}) {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);

  const result = await helpers.makeRequest<Awaited<ReturnType<typeof _getCombinedBalanceHistory>>, R>({
    method: 'get',
    url: `/stats/combined-balance-history${params.toString() ? `?${params.toString()}` : ''}`,
    raw,
  });

  return result;
}
