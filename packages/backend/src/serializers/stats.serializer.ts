/**
 * Stats Serializers
 *
 * Serializes stats data for API responses.
 * Uses Money.fromCents() for raw cents values from services/aggregates.
 */
import { type endpointsTypes } from '@bt/shared/types';
import { centsToApiDecimal } from '@common/types/money';
import type Balances from '@models/balances.model';
import type { CombinedBalanceHistoryItem } from '@services/stats/get-combined-balance-history';
import type { InvestmentContributionsResultCents } from '@services/stats/get-investment-contributions';
import type { NetWorthDriversResultCents } from '@services/stats/get-net-worth-drivers';
import type { PivotReportResultCents } from '@services/stats/get-pivot';

// ============================================================================
// Balance History Serializers
// ============================================================================

interface BalanceHistoryItemApiResponse {
  date: Date | string;
  amount: number;
  accountId: string;
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
// Spendings by Categories Serializers
// ============================================================================

interface SpendingStructureApiResponse {
  name: string;
  color: string;
  amount: number;
}

type GetSpendingsByCategoriesApiResponse = {
  [categoryId: string]: SpendingStructureApiResponse;
};

/**
 * Serialize spendings by categories (from getSpendingsByCategories)
 */
export function serializeSpendingsByCategories(
  spendings: endpointsTypes.GetSpendingsByCategoriesReturnType,
): GetSpendingsByCategoriesApiResponse {
  const result: GetSpendingsByCategoriesApiResponse = {};

  for (const [categoryId, spending] of Object.entries(spendings)) {
    result[categoryId] = {
      name: spending.name,
      color: spending.color,
      amount: centsToApiDecimal(spending.amount),
    };
  }

  return result;
}

interface SpendingStructureByTypeApiResponse {
  name: string;
  color: string;
  income: number;
  expense: number;
}

type GetSpendingsByCategoriesByTypeApiResponse = {
  [categoryId: string]: SpendingStructureByTypeApiResponse;
};

/**
 * Serialize per-type spendings by categories (from getSpendingsByCategoriesByType)
 */
export function serializeSpendingsByCategoriesByType(
  spendings: endpointsTypes.GetSpendingsByCategoriesByTypeReturnType,
): GetSpendingsByCategoriesByTypeApiResponse {
  const result: GetSpendingsByCategoriesByTypeApiResponse = {};

  for (const [categoryId, spending] of Object.entries(spendings)) {
    result[categoryId] = {
      name: spending.name,
      color: spending.color,
      income: centsToApiDecimal(spending.income),
      expense: centsToApiDecimal(spending.expense),
    };
  }

  return result;
}

// ============================================================================
// Cash Flow Serializers
// ============================================================================

interface CashFlowCategoryDataApiResponse {
  categoryId: string;
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
// Pivot Report Serializer
// ============================================================================

const decimalizeValues = (values: Record<string, number>): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const [columnKey, cents] of Object.entries(values)) {
    result[columnKey] = centsToApiDecimal(cents);
  }
  return result;
};

/**
 * Serialize pivot report (from getPivotReport). Converts every cents amount to an API decimal;
 * row/column identity, labels, colors and currency pass through unchanged.
 */
export function serializePivotReport(result: PivotReportResultCents): endpointsTypes.GetPivotReportResponse {
  return {
    columns: result.columns,
    rows: result.rows.map((row) => ({
      id: row.id,
      label: row.label,
      color: row.color,
      // Only the payee dimension sets logoDomain; keep it off every other dimension's rows.
      ...(row.logoDomain !== undefined ? { logoDomain: row.logoDomain } : {}),
      parentId: row.parentId,
      kind: row.kind,
      values: decimalizeValues(row.values),
      total: centsToApiDecimal(row.total),
    })),
    columnTotals: decimalizeValues(result.columnTotals),
    grandTotal: centsToApiDecimal(result.grandTotal),
    currencyCode: result.currencyCode,
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
  venturesBalance: number;
  vehiclesBalance: number;
  loansBalance: number;
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
    venturesBalance: centsToApiDecimal(item.venturesBalance),
    vehiclesBalance: centsToApiDecimal(item.vehiclesBalance),
    loansBalance: centsToApiDecimal(item.loansBalance),
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

// ============================================================================
// Net Worth Drivers Serializer
// ============================================================================

/**
 * Serialize net worth drivers (from getNetWorthDrivers). Every amount is money,
 * so every amount is decimalized; the period bounds pass through as dates, and
 * `degraded` (securities and currency codes, no money) forwards untouched.
 */
export function serializeNetWorthDrivers(
  result: NetWorthDriversResultCents,
): endpointsTypes.GetNetWorthDriversResponse {
  return {
    buckets: result.buckets.map((bucket) => ({
      periodStart: bucket.periodStart,
      periodEnd: bucket.periodEnd,
      savings: {
        income: centsToApiDecimal(bucket.savings.income),
        expenses: centsToApiDecimal(bucket.savings.expenses),
        net: centsToApiDecimal(bucket.savings.net),
      },
      investments: {
        growth: centsToApiDecimal(bucket.investments.growth),
        priceEffect: centsToApiDecimal(bucket.investments.priceEffect),
        dividends: centsToApiDecimal(bucket.investments.dividends),
        feesAndTaxes: centsToApiDecimal(bucket.investments.feesAndTaxes),
      },
      composition: {
        holdingsValue: centsToApiDecimal(bucket.composition.holdingsValue),
        cashValue: centsToApiDecimal(bucket.composition.cashValue),
      },
    })),
    // Kept off the response entirely when the service reports nothing degraded: the
    // contract lets a client decide on `degraded` alone whether to warn, and a
    // present-but-empty key would trip that check on a cleanly valued range.
    ...(result.degraded ? { degraded: result.degraded } : {}),
  };
}

// ============================================================================
// Investment Contributions Serializer
// ============================================================================

/**
 * Serialize investment contributions (from getInvestmentContributions). Every
 * bucket amount is money, so `total`, `savingsNet` and each `byPortfolio.amount`
 * are decimalized; period bounds pass through as dates and the `portfolios` legend
 * (ids and names, no money) forwards untouched.
 */
export function serializeInvestmentContributions(
  result: InvestmentContributionsResultCents,
): endpointsTypes.GetInvestmentContributionsResponse {
  return {
    buckets: result.buckets.map((bucket) => ({
      periodStart: bucket.periodStart,
      periodEnd: bucket.periodEnd,
      total: centsToApiDecimal(bucket.total),
      byPortfolio: bucket.byPortfolio.map((slice) => ({
        portfolioId: slice.portfolioId,
        amount: centsToApiDecimal(slice.amount),
      })),
      savingsNet: centsToApiDecimal(bucket.savingsNet),
    })),
    portfolios: result.portfolios,
  };
}
