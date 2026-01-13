import { api } from '@/api/_api';
import { type TRANSACTION_TYPES, endpointsTypes } from '@bt/shared/types';
import { format } from 'date-fns';

const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');

interface Params {
  accountId?: endpointsTypes.GetBalanceHistoryPayload['accountId'];
  from?: Date;
  to?: Date;
}

export interface BalanceHistoryEntity {
  date: string;
  amount: number;
  accountId: number;
}

// Backend now returns decimals directly, no conversion needed
export const getBalanceHistory = async ({ from, to, ...rest }: Params = {}): Promise<BalanceHistoryEntity[]> => {
  const params: endpointsTypes.GetBalanceHistoryPayload = {
    ...rest,
  };

  if (from) params.from = formatDate(from);
  if (to) params.to = formatDate(to);

  return api.get('/stats/balance-history', params);
};

export const getExpensesAmountForPeriod = async ({ from, to, ...rest }: Params = {}): Promise<number> => {
  const params: endpointsTypes.GetBalanceHistoryPayload = {
    ...rest,
  };

  if (from) params.from = formatDate(from);
  if (to) params.to = formatDate(to);

  return api.get('/stats/expenses-amount-for-period', params);
};

export const getSpendingsByCategories = async ({
  from,
  to,
  type,
  ...rest
}: Params & { type?: TRANSACTION_TYPES } = {}): Promise<endpointsTypes.GetSpendingsByCategoriesReturnType> => {
  const params: endpointsTypes.GetBalanceHistoryPayload & { type?: string } = {
    ...rest,
  };

  if (from) params.from = formatDate(from);
  if (to) params.to = formatDate(to);
  if (type) params.type = type;

  return api.get('/stats/spendings-by-categories', params);
};

export const getTotalBalance = async ({ date }: { date: Date }): Promise<number> => {
  const params = {
    date: formatDate(date),
  };

  return api.get('/stats/total-balance', params);
};

export interface CombinedBalanceHistoryEntity {
  date: string;
  accountsBalance: number;
  portfoliosBalance: number;
  totalBalance: number;
}

export const getCombinedBalanceHistory = async ({ from, to }: { from?: Date; to?: Date } = {}): Promise<
  CombinedBalanceHistoryEntity[]
> => {
  const params: { from?: string; to?: string } = {};

  if (from) params.from = formatDate(from);
  if (to) params.to = formatDate(to);

  return api.get('/stats/combined-balance-history', params);
};

export interface GetCashFlowParams {
  from: Date;
  to: Date;
  granularity: endpointsTypes.CashFlowGranularity;
  accountId?: number;
  categoryIds?: number[];
  excludeCategories?: boolean;
}

export const getCashFlow = async ({
  from,
  to,
  granularity,
  accountId,
  categoryIds,
  excludeCategories,
}: GetCashFlowParams): Promise<endpointsTypes.GetCashFlowResponse> => {
  const params: Record<string, string | number | boolean> = {
    from: formatDate(from),
    to: formatDate(to),
    granularity,
  };

  if (accountId !== undefined) params.accountId = accountId;
  if (categoryIds !== undefined && categoryIds.length > 0) {
    params.categoryIds = categoryIds.join(',');
  }
  if (excludeCategories !== undefined) params.excludeCategories = excludeCategories;

  return api.get('/stats/cash-flow', params);
};

export interface GetCumulativeDataParams {
  from: Date;
  to: Date;
  metric: endpointsTypes.CumulativeMetric;
  accountId?: number;
  excludeCategories?: boolean;
}

export const getCumulativeData = async ({
  from,
  to,
  metric,
  accountId,
  excludeCategories,
}: GetCumulativeDataParams): Promise<endpointsTypes.GetCumulativeResponse> => {
  const params: Record<string, string | number | boolean> = {
    from: formatDate(from),
    to: formatDate(to),
    metric,
  };

  if (accountId !== undefined) params.accountId = accountId;
  if (excludeCategories !== undefined) params.excludeCategories = excludeCategories;

  return api.get('/stats/cumulative', params);
};
