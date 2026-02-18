/**
 * Stats Serializers
 *
 * Serializes stats data for API responses.
 * Uses Money.fromCents() for raw cents values from services/aggregates.
 */
import { type endpointsTypes } from '@bt/shared/types';
import { Money } from '@common/types/money';
import type Balances from '@models/Balances.model';
import type { CombinedBalanceHistoryItem } from '@services/stats/get-combined-balance-history';
import type { GetExpensesHistoryResponseSchema } from '@services/stats/get-expenses-history';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a money value (Money instance or raw cents number) to a decimal number for API
 */
function convertAmount(value: number | Money): number {
  if (Money.isMoney(value)) return value.toNumber();
  return Money.fromCents(value).toNumber();
}

// ============================================================================
// Balance History Serializers
// ============================================================================

export interface BalanceHistoryItemApiResponse {
  date: Date | string;
  amount: number;
  accountId: number;
}

/**
 * Serialize balance history items (from getBalanceHistory)
 */
export function serializeBalanceHistory(balances: Balances[]): BalanceHistoryItemApiResponse[] {
  return balances.map((balance) => ({
    date: balance.date,
    amount: convertAmount(balance.amount),
    accountId: balance.accountId,
  }));
}

export interface AggregatedBalanceHistoryItemApiResponse {
  date: string;
  amount: number;
}

/**
 * Serialize aggregated balance history items (from getAggregatedBalanceHistory)
 */
export function serializeAggregatedBalanceHistory(
  balances: { date: string; amount: number }[],
): AggregatedBalanceHistoryItemApiResponse[] {
  return balances.map((balance) => ({
    date: balance.date,
    amount: convertAmount(balance.amount),
  }));
}

// ============================================================================
// Total Balance Serializer
// ============================================================================

/**
 * Serialize total balance (from getTotalBalance)
 */
export function serializeTotalBalance(totalCents: number): number {
  return convertAmount(totalCents);
}

// ============================================================================
// Expenses History Serializers
// ============================================================================

export interface ExpensesHistoryItemApiResponse {
  id: number;
  accountId: number;
  time: Date;
  amount: number;
  refAmount: number;
  currencyCode: string;
  categoryId: number;
  refundLinked: boolean;
  transactionType: string;
}

/**
 * Serialize expenses history items (from getExpensesHistory)
 */
export function serializeExpensesHistory(
  expenses: GetExpensesHistoryResponseSchema[],
): ExpensesHistoryItemApiResponse[] {
  return expenses.map((expense) => ({
    id: expense.id,
    accountId: expense.accountId,
    time: expense.time,
    amount: convertAmount(expense.amount),
    refAmount: convertAmount(expense.refAmount),
    currencyCode: expense.currencyCode,
    categoryId: expense.categoryId,
    refundLinked: expense.refundLinked,
    transactionType: expense.transactionType,
  }));
}

// ============================================================================
// Spendings by Categories Serializers
// ============================================================================

export interface SpendingStructureApiResponse {
  name: string;
  color: string;
  amount: number;
}

export type GetSpendingsByCategoriesApiResponse = {
  [categoryId: number]: SpendingStructureApiResponse;
};

/**
 * Serialize spendings by categories (from getSpendingsByCategories)
 */
export function serializeSpendingsByCategories(
  spendings: endpointsTypes.GetSpendingsByCategoriesReturnType,
): GetSpendingsByCategoriesApiResponse {
  const result: GetSpendingsByCategoriesApiResponse = {};

  for (const [categoryId, spending] of Object.entries(spendings)) {
    result[Number(categoryId)] = {
      name: spending.name,
      color: spending.color,
      amount: convertAmount(spending.amount),
    };
  }

  return result;
}

// ============================================================================
// Cash Flow Serializers
// ============================================================================

export interface CashFlowCategoryDataApiResponse {
  categoryId: number;
  name: string;
  color: string;
  incomeAmount: number;
  expenseAmount: number;
}

export interface CashFlowPeriodDataApiResponse {
  periodStart: string;
  periodEnd: string;
  income: number;
  expenses: number;
  netFlow: number;
  categories?: CashFlowCategoryDataApiResponse[];
}

export interface GetCashFlowApiResponse {
  periods: CashFlowPeriodDataApiResponse[];
  totals: {
    income: number;
    expenses: number;
    netFlow: number;
    savingsRate: number;
  };
}

/**
 * Serialize cash flow response (from getCashFlow)
 */
export function serializeCashFlow(cashFlow: endpointsTypes.GetCashFlowResponse): GetCashFlowApiResponse {
  return {
    periods: cashFlow.periods.map((period) => ({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      income: convertAmount(period.income),
      expenses: convertAmount(period.expenses),
      netFlow: convertAmount(period.netFlow),
      categories: period.categories?.map((category) => ({
        categoryId: category.categoryId,
        name: category.name,
        color: category.color,
        incomeAmount: convertAmount(category.incomeAmount),
        expenseAmount: convertAmount(category.expenseAmount),
      })),
    })),
    totals: {
      income: convertAmount(cashFlow.totals.income),
      expenses: convertAmount(cashFlow.totals.expenses),
      netFlow: convertAmount(cashFlow.totals.netFlow),
      savingsRate: cashFlow.totals.savingsRate,
    },
  };
}

// ============================================================================
// Cumulative Data Serializers
// ============================================================================

export interface CumulativeMonthDataApiResponse {
  month: number;
  monthLabel: string;
  value: number;
  periodValue: number;
}

export interface CumulativePeriodDataApiResponse {
  year: number;
  data: CumulativeMonthDataApiResponse[];
  total: number;
}

export interface GetCumulativeApiResponse {
  currentPeriod: CumulativePeriodDataApiResponse;
  previousPeriod: CumulativePeriodDataApiResponse;
  percentChange: number;
}

/**
 * Serialize cumulative period data
 */
function serializeCumulativePeriod(period: endpointsTypes.CumulativePeriodData): CumulativePeriodDataApiResponse {
  return {
    year: period.year,
    data: period.data.map((monthData) => ({
      month: monthData.month,
      monthLabel: monthData.monthLabel,
      value: convertAmount(monthData.value),
      periodValue: convertAmount(monthData.periodValue),
    })),
    total: convertAmount(period.total),
  };
}

/**
 * Serialize cumulative response (from getCumulativeData)
 */
export function serializeCumulativeData(cumulative: endpointsTypes.GetCumulativeResponse): GetCumulativeApiResponse {
  return {
    currentPeriod: serializeCumulativePeriod(cumulative.currentPeriod),
    previousPeriod: serializeCumulativePeriod(cumulative.previousPeriod),
    percentChange: cumulative.percentChange,
  };
}

// ============================================================================
// Combined Balance History Serializers
// ============================================================================

export interface CombinedBalanceHistoryItemApiResponse {
  date: string;
  accountsBalance: number;
  portfoliosBalance: number;
  totalBalance: number;
}

/**
 * Serialize combined balance history (from getCombinedBalanceHistory)
 */
export function serializeCombinedBalanceHistory(
  items: CombinedBalanceHistoryItem[],
): CombinedBalanceHistoryItemApiResponse[] {
  return items.map((item) => ({
    date: item.date,
    accountsBalance: convertAmount(item.accountsBalance),
    portfoliosBalance: convertAmount(item.portfoliosBalance),
    totalBalance: convertAmount(item.totalBalance),
  }));
}

// ============================================================================
// Expenses Amount for Period Serializer
// ============================================================================

/**
 * Serialize expenses amount for period (from getExpensesAmountForPeriod)
 */
export function serializeExpensesAmountForPeriod(amountCents: number): number {
  return convertAmount(amountCents);
}
