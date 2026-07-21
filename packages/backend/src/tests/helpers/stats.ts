import { BalanceModel, TRANSACTION_TYPES, endpointsTypes } from '@bt/shared/types';
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
  accountId?: string;
  raw?: R;
} = {}) {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  if (accountId) params.append('accountId', accountId);

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
  categoryIds,
  type,
  groupByType,
}: {
  raw?: boolean;
  from?: string;
  to?: string;
  categoryIds?: string[];
  type?: TRANSACTION_TYPES;
  groupByType?: boolean;
} = {}) => {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  if (categoryIds && categoryIds.length > 0) params.append('categoryIds', categoryIds.join(','));
  if (type) params.append('type', type);
  if (groupByType) params.append('groupByType', 'true');

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
  categoryIds,
  raw,
}: {
  from: string;
  to: string;
  granularity: endpointsTypes.CashFlowGranularity;
  categoryIds?: string[];
  raw?: R;
}) {
  const params = new URLSearchParams();
  params.append('from', from);
  params.append('to', to);
  params.append('granularity', granularity);
  if (categoryIds && categoryIds.length > 0) params.append('categoryIds', categoryIds.join(','));

  const result = await helpers.makeRequest<endpointsTypes.GetCashFlowResponse, R>({
    method: 'get',
    url: `/stats/cash-flow?${params.toString()}`,
    raw,
  });

  return result;
}

export async function getNetWorthDrivers<R extends boolean | undefined = undefined>({
  from,
  to,
  granularity,
  portfolioIds,
  raw,
}: {
  from: string;
  to: string;
  granularity: endpointsTypes.NetWorthDriversGranularity;
  portfolioIds?: string[];
  raw?: R;
}) {
  const params = new URLSearchParams();
  params.append('from', from);
  params.append('to', to);
  params.append('granularity', granularity);
  if (portfolioIds && portfolioIds.length > 0) params.append('portfolioIds', portfolioIds.join(','));

  const result = await helpers.makeRequest<endpointsTypes.GetNetWorthDriversResponse, R>({
    method: 'get',
    url: `/stats/net-worth-drivers?${params.toString()}`,
    raw,
  });

  return result;
}

export async function getInvestmentContributions<R extends boolean | undefined = undefined>({
  from,
  to,
  granularity,
  portfolioIds,
  raw,
}: {
  from: string;
  to: string;
  granularity: endpointsTypes.InvestmentContributionsGranularity;
  portfolioIds?: string[];
  raw?: R;
}) {
  const params = new URLSearchParams();
  params.append('from', from);
  params.append('to', to);
  params.append('granularity', granularity);
  if (portfolioIds && portfolioIds.length > 0) params.append('portfolioIds', portfolioIds.join(','));

  const result = await helpers.makeRequest<endpointsTypes.GetInvestmentContributionsResponse, R>({
    method: 'get',
    url: `/stats/investment-contributions?${params.toString()}`,
    raw,
  });

  return result;
}

export async function getPivotReport<R extends boolean | undefined = undefined>({
  from,
  to,
  granularity,
  rowDimension,
  measure,
  accountIds,
  categoryIds,
  payeeIds,
  raw,
}: {
  from: string;
  to: string;
  granularity: endpointsTypes.PivotGranularity;
  rowDimension: endpointsTypes.PivotRowDimension;
  measure: endpointsTypes.PivotMeasure;
  accountIds?: string[];
  categoryIds?: string[];
  payeeIds?: string[];
  raw?: R;
}) {
  const params = new URLSearchParams();
  params.append('from', from);
  params.append('to', to);
  params.append('granularity', granularity);
  params.append('rowDimension', rowDimension);
  params.append('measure', measure);
  if (accountIds && accountIds.length > 0) params.append('accountIds', accountIds.join(','));
  if (categoryIds && categoryIds.length > 0) params.append('categoryIds', categoryIds.join(','));
  if (payeeIds && payeeIds.length > 0) params.append('payeeIds', payeeIds.join(','));

  const result = await helpers.makeRequest<endpointsTypes.GetPivotReportResponse, R>({
    method: 'get',
    url: `/stats/pivot?${params.toString()}`,
    raw,
  });

  return result;
}

export async function getTotalBalance<R extends boolean | undefined = undefined>({
  date,
  raw,
}: {
  date: string;
  raw?: R;
}) {
  const params = new URLSearchParams();
  params.append('date', date);

  const result = await helpers.makeRequest<number, R>({
    method: 'get',
    url: `/stats/total-balance?${params.toString()}`,
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
