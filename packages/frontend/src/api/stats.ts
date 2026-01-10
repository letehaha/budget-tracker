import { api } from '@/api/_api';
import { fromSystemAmount } from '@/api/helpers';
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

export const getBalanceHistory = async ({ from, to, ...rest }: Params = {}): Promise<BalanceHistoryEntity[]> => {
  const params: endpointsTypes.GetBalanceHistoryPayload = {
    ...rest,
  };

  if (from) params.from = formatDate(from);
  if (to) params.to = formatDate(to);

  const history: BalanceHistoryEntity[] = await api.get('/stats/balance-history', params);

  return history.map((item) => ({
    ...item,
    amount: fromSystemAmount(item.amount),
  }));
};

export const getExpensesAmountForPeriod = async ({ from, to, ...rest }: Params = {}): Promise<number> => {
  const params: endpointsTypes.GetBalanceHistoryPayload = {
    ...rest,
  };

  if (from) params.from = formatDate(from);
  if (to) params.to = formatDate(to);

  const amount: number = await api.get('/stats/expenses-amount-for-period', params);

  return fromSystemAmount(amount);
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

  const history: endpointsTypes.GetSpendingsByCategoriesReturnType = await api.get(
    '/stats/spendings-by-categories',
    params,
  );

  Object.keys(history).forEach((id) => {
    const record = history[+id];
    if (record) {
      record.amount = fromSystemAmount(record.amount);
    }
  });

  return history;
};

export const getTotalBalance = async ({ date }: { date: Date }) => {
  const params = {
    date: formatDate(date),
  };

  const balance: number = await api.get('/stats/total-balance', params);

  return fromSystemAmount(balance);
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

  const history: CombinedBalanceHistoryEntity[] = await api.get('/stats/combined-balance-history', params);

  return history.map((item) => ({
    ...item,
    accountsBalance: fromSystemAmount(item.accountsBalance),
    portfoliosBalance: fromSystemAmount(item.portfoliosBalance),
    totalBalance: fromSystemAmount(item.totalBalance),
  }));
};

export interface GetCashFlowParams {
  from: Date;
  to: Date;
  granularity: endpointsTypes.CashFlowGranularity;
  accountId?: number;
  excludeCategories?: boolean;
}

export const getCashFlow = async ({
  from,
  to,
  granularity,
  accountId,
  excludeCategories,
}: GetCashFlowParams): Promise<endpointsTypes.GetCashFlowResponse> => {
  const params: Record<string, string | number | boolean> = {
    from: formatDate(from),
    to: formatDate(to),
    granularity,
  };

  if (accountId !== undefined) params.accountId = accountId;
  if (excludeCategories !== undefined) params.excludeCategories = excludeCategories;

  const response: endpointsTypes.GetCashFlowResponse = await api.get('/stats/cash-flow', params);

  return {
    periods: response.periods.map((period) => ({
      ...period,
      income: fromSystemAmount(period.income),
      expenses: fromSystemAmount(period.expenses),
      netFlow: fromSystemAmount(period.netFlow),
    })),
    totals: {
      ...response.totals,
      income: fromSystemAmount(response.totals.income),
      expenses: fromSystemAmount(response.totals.expenses),
      netFlow: fromSystemAmount(response.totals.netFlow),
    },
  };
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

  const response: endpointsTypes.GetCumulativeResponse = await api.get('/stats/cumulative', params);

  // Convert amounts from system format
  const convertPeriodData = (periodData: endpointsTypes.CumulativePeriodData): endpointsTypes.CumulativePeriodData => ({
    ...periodData,
    data: periodData.data.map((month) => ({
      ...month,
      value: fromSystemAmount(month.value),
      periodValue: fromSystemAmount(month.periodValue),
    })),
    total: fromSystemAmount(periodData.total),
  });

  return {
    currentPeriod: convertPeriodData(response.currentPeriod),
    previousPeriod: convertPeriodData(response.previousPeriod),
    percentChange: response.percentChange,
  };
};
