import { api } from '@/api/_api';
import { type RecordId, type TRANSACTION_TYPES, endpointsTypes } from '@bt/shared/types';
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
  accountId: string;
}

/** Per-account balance history — signed amounts (liabilities negative), decimals. */
export const getAccountBalanceHistory = async ({
  accountId,
  from,
  to,
}: {
  accountId: RecordId;
  from?: Date;
  to?: Date;
}): Promise<BalanceHistoryEntity[]> => {
  const params: endpointsTypes.GetBalanceHistoryPayload = { accountId };
  if (from) params.from = formatDate(from);
  if (to) params.to = formatDate(to);
  return api.get('/stats/balance-history', params);
};

export const getExpensesAmountForPeriod = async ({
  from,
  to,
  excludedCategoryIds,
  ...rest
}: Params & { excludedCategoryIds?: string[] } = {}): Promise<number> => {
  const params: endpointsTypes.GetBalanceHistoryPayload & { excludedCategoryIds?: string } = {
    ...rest,
  };

  if (from) params.from = formatDate(from);
  if (to) params.to = formatDate(to);
  if (excludedCategoryIds && excludedCategoryIds.length > 0) params.excludedCategoryIds = excludedCategoryIds.join(',');

  return api.get('/stats/expenses-amount-for-period', params);
};

export const getSpendingsByCategories = async ({
  from,
  to,
  type,
  categoryIds,
  excludedCategoryIds,
  ...rest
}: Params & {
  type?: TRANSACTION_TYPES;
  categoryIds?: string[];
  excludedCategoryIds?: string[];
} = {}): Promise<endpointsTypes.GetSpendingsByCategoriesReturnType> => {
  const params: endpointsTypes.GetBalanceHistoryPayload & {
    type?: string;
    categoryIds?: string;
    excludedCategoryIds?: string;
  } = {
    ...rest,
  };

  if (from) params.from = formatDate(from);
  if (to) params.to = formatDate(to);
  if (type) params.type = type;
  if (categoryIds && categoryIds.length > 0) params.categoryIds = categoryIds.join(',');
  if (excludedCategoryIds && excludedCategoryIds.length > 0) params.excludedCategoryIds = excludedCategoryIds.join(',');

  return api.get('/stats/spendings-by-categories', params);
};

export const getSpendingsByCategoriesByType = async ({
  from,
  to,
  categoryIds,
  excludedCategoryIds,
  ...rest
}: Params & {
  categoryIds?: string[];
  excludedCategoryIds?: string[];
} = {}): Promise<endpointsTypes.GetSpendingsByCategoriesByTypeReturnType> => {
  const params: Record<string, string | boolean> = { groupByType: true };

  if (rest.accountId) params.accountId = rest.accountId;
  if (from) params.from = formatDate(from);
  if (to) params.to = formatDate(to);
  if (categoryIds && categoryIds.length > 0) params.categoryIds = categoryIds.join(',');
  if (excludedCategoryIds && excludedCategoryIds.length > 0) params.excludedCategoryIds = excludedCategoryIds.join(',');

  return api.get('/stats/spendings-by-categories', params);
};

export interface CombinedBalanceHistoryEntity {
  date: string;
  accountsBalance: number;
  portfoliosBalance: number;
  venturesBalance: number;
  vehiclesBalance: number;
  loansBalance: number;
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

export const getEarliestTransactionDate = async (): Promise<string | null> => {
  return api.get('/stats/earliest-transaction-date');
};

interface GetCashFlowParams {
  from: Date;
  to: Date;
  granularity: endpointsTypes.CashFlowGranularity;
  accountId?: string;
  categoryIds?: string[];
}

export const getCashFlow = async ({
  from,
  to,
  granularity,
  accountId,
  categoryIds,
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

  return api.get('/stats/cash-flow', params);
};

interface GetPivotReportParams {
  from: Date;
  to: Date;
  granularity: endpointsTypes.PivotGranularity;
  rowDimension: endpointsTypes.PivotRowDimension;
  measure: endpointsTypes.PivotMeasure;
  accountIds?: string[];
  categoryIds?: string[];
  payeeIds?: string[];
}

export const getPivotReport = async ({
  from,
  to,
  granularity,
  rowDimension,
  measure,
  accountIds,
  categoryIds,
  payeeIds,
}: GetPivotReportParams): Promise<endpointsTypes.GetPivotReportResponse> => {
  const params: Record<string, string> = {
    from: formatDate(from),
    to: formatDate(to),
    granularity,
    rowDimension,
    measure,
  };

  if (accountIds && accountIds.length > 0) params.accountIds = accountIds.join(',');
  if (categoryIds && categoryIds.length > 0) params.categoryIds = categoryIds.join(',');
  if (payeeIds && payeeIds.length > 0) params.payeeIds = payeeIds.join(',');

  return api.get('/stats/pivot', params);
};

interface GetCumulativeDataParams {
  from: Date;
  to: Date;
  metric: endpointsTypes.CumulativeMetric;
  accountId?: string;
}

export const getCumulativeData = async ({
  from,
  to,
  metric,
  accountId,
}: GetCumulativeDataParams): Promise<endpointsTypes.GetCumulativeResponse> => {
  const params: Record<string, string | number | boolean> = {
    from: formatDate(from),
    to: formatDate(to),
    metric,
  };

  if (accountId !== undefined) params.accountId = accountId;

  return api.get('/stats/cumulative', params);
};
