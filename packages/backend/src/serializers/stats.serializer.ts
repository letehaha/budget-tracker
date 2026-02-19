/**
 * Stats Serializers
 *
 * Serializes stats data for API responses.
 * Uses Money.fromCents() for raw cents values from services/aggregates.
 */
import { type endpointsTypes } from '@bt/shared/types';
import { centsToApiDecimal } from '@common/types/money';
import type Balances from '@models/Balances.model';
import type { CombinedBalanceHistoryItem } from '@services/stats/get-combined-balance-history';
import type { GetExpensesHistoryResponseSchema } from '@services/stats/get-expenses-history';

// ============================================================================
// Balance History Serializers
// ============================================================================

interface BalanceHistoryItemApiResponse {
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
    amount: centsToApiDecimal(balance.amount),
    accountId: balance.accountId,
  }));
}

// ============================================================================
// Total Balance Serializer
// ============================================================================

/**
 * Serialize total balance (from getTotalBalance)
 */
export function serializeTotalBalance(totalCents: number): number {
  return centsToApiDecimal(totalCents);
}

// ============================================================================
// Expenses History Serializers
// ============================================================================

interface ExpensesHistoryItemApiResponse {
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
    amount: centsToApiDecimal(expense.amount),
    refAmount: centsToApiDecimal(expense.refAmount),
    currencyCode: expense.currencyCode,
    categoryId: expense.categoryId,
    refundLinked: expense.refundLinked,
    transactionType: expense.transactionType,
  }));
}

// ============================================================================
// Spendings by Categories Serializers
// ============================================================================

interface SpendingStructureApiResponse {
  name: string;
  color: string;
  amount: number;
}

type GetSpendingsByCategoriesApiResponse = {
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
      amount: centsToApiDecimal(spending.amount),
    };
  }

  return result;
}

// ============================================================================
// Cash Flow Serializers
// ============================================================================

interface CashFlowCategoryDataApiResponse {
  categoryId: number;
  name: string;
  color: string;
  incomeAmount: number;
  expenseAmount: number;
}

interface CashFlowPeriodDataApiResponse {
  periodStart: string;
  periodEnd: string;
  income: number;
  expenses: number;
  netFlow: number;
  categories?: CashFlowCategoryDataApiResponse[];
}

interface GetCashFlowApiResponse {
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
      income: centsToApiDecimal(period.income),
      expenses: centsToApiDecimal(period.expenses),
      netFlow: centsToApiDecimal(period.netFlow),
      categories: period.categories?.map((category) => ({
        categoryId: category.categoryId,
        name: category.name,
        color: category.color,
        incomeAmount: centsToApiDecimal(category.incomeAmount),
        expenseAmount: centsToApiDecimal(category.expenseAmount),
      })),
    })),
    totals: {
      income: centsToApiDecimal(cashFlow.totals.income),
      expenses: centsToApiDecimal(cashFlow.totals.expenses),
      netFlow: centsToApiDecimal(cashFlow.totals.netFlow),
      savingsRate: cashFlow.totals.savingsRate,
    },
  };
}

// ============================================================================
// Cumulative Data Serializers
// ============================================================================

interface CumulativeMonthDataApiResponse {
  month: number;
  monthLabel: string;
  value: number;
  periodValue: number;
}

interface CumulativePeriodDataApiResponse {
  year: number;
  data: CumulativeMonthDataApiResponse[];
  total: number;
}

interface GetCumulativeApiResponse {
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
      value: centsToApiDecimal(monthData.value),
      periodValue: centsToApiDecimal(monthData.periodValue),
    })),
    total: centsToApiDecimal(period.total),
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

interface CombinedBalanceHistoryItemApiResponse {
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
    accountsBalance: centsToApiDecimal(item.accountsBalance),
    portfoliosBalance: centsToApiDecimal(item.portfoliosBalance),
    totalBalance: centsToApiDecimal(item.totalBalance),
  }));
}

// ============================================================================
// Expenses Amount for Period Serializer
// ============================================================================

/**
 * Serialize expenses amount for period (from getExpensesAmountForPeriod)
 */
export function serializeExpensesAmountForPeriod(amountCents: number): number {
  return centsToApiDecimal(amountCents);
}
