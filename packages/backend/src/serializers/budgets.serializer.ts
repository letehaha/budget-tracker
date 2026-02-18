/**
 * Budget Serializers
 *
 * Serializes budget model instances for API responses.
 * Money fields auto-convert via .toNumber().
 * Deserializers convert API decimal inputs to Money.
 */
import { BUDGET_TYPES } from '@bt/shared/types';
import { Money, centsToApiDecimal } from '@common/types/money';
import type Budgets from '@models/Budget.model';

// ============================================================================
// Response Types
// ============================================================================

export interface BudgetCategoryResponse {
  id: number;
  name: string;
  color: string;
  parentId: number | null;
}

export interface BudgetApiResponse {
  id: number;
  name: string;
  status: string;
  type: BUDGET_TYPES;
  startDate: Date | null;
  endDate: Date | null;
  autoInclude: boolean;
  limitAmount: number | null;
  categories: BudgetCategoryResponse[];
}

// ============================================================================
// Request Types (API format with decimal input)
// ============================================================================

export interface CreateBudgetRequest {
  name: string;
  status?: string;
  type?: BUDGET_TYPES;
  categoryIds?: number[];
  startDate?: string | null;
  endDate?: string | null;
  autoInclude?: boolean;
  limitAmount?: number | null; // decimal from API
}

export interface UpdateBudgetRequest {
  name?: string;
  status?: string;
  categoryIds?: number[];
  startDate?: string | null;
  endDate?: string | null;
  autoInclude?: boolean;
  limitAmount?: number | null; // decimal from API
}

// ============================================================================
// Internal Types (DB format with Money)
// ============================================================================

export interface CreateBudgetInternal {
  name: string;
  status?: string;
  type?: BUDGET_TYPES;
  categoryIds?: number[];
  startDate?: Date | null;
  endDate?: Date | null;
  autoInclude?: boolean;
  limitAmount?: Money | null;
  userId: number;
}

export interface UpdateBudgetInternal {
  name?: string;
  status?: string;
  categoryIds?: number[];
  startDate?: Date | null;
  endDate?: Date | null;
  autoInclude?: boolean;
  limitAmount?: Money | null;
}

// ============================================================================
// Serializers (DB → API)
// ============================================================================

/**
 * Serialize a budget from DB format to API response
 */
export function serializeBudget(budget: Budgets): BudgetApiResponse {
  const categories: BudgetCategoryResponse[] = (budget.categories || []).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    parentId: c.parentId,
  }));

  return {
    id: budget.id,
    name: budget.name,
    status: budget.status,
    type: budget.type,
    startDate: budget.startDate,
    endDate: budget.endDate,
    autoInclude: budget.autoInclude,
    limitAmount: budget.limitAmount !== null ? budget.limitAmount.toNumber() : null,
    categories,
  };
}

/**
 * Serialize multiple budgets
 */
export function serializeBudgets(budgets: Budgets[]): BudgetApiResponse[] {
  return budgets.map(serializeBudget);
}

// ============================================================================
// Deserializers (API → DB)
// ============================================================================

/**
 * Deserialize a create budget request from API decimal format to internal cents format
 */
export function deserializeCreateBudget(req: CreateBudgetRequest, userId: number): CreateBudgetInternal {
  return {
    name: req.name,
    status: req.status,
    type: req.type,
    categoryIds: req.categoryIds,
    startDate: req.startDate ? new Date(req.startDate) : undefined,
    endDate: req.endDate ? new Date(req.endDate) : undefined,
    autoInclude: req.autoInclude,
    limitAmount:
      req.limitAmount !== undefined && req.limitAmount !== null ? Money.fromDecimal(req.limitAmount) : undefined,
    userId,
  };
}

/**
 * Deserialize an update budget request from API decimal format to internal cents format
 */
export function deserializeUpdateBudget(req: UpdateBudgetRequest): UpdateBudgetInternal {
  return {
    name: req.name,
    status: req.status,
    categoryIds: req.categoryIds,
    startDate: req.startDate ? new Date(req.startDate) : req.startDate === null ? null : undefined,
    endDate: req.endDate ? new Date(req.endDate) : req.endDate === null ? null : undefined,
    autoInclude: req.autoInclude,
    limitAmount:
      req.limitAmount !== undefined
        ? req.limitAmount !== null
          ? Money.fromDecimal(req.limitAmount)
          : null
        : undefined,
  };
}

// ============================================================================
// Budget Stats Serializer
// ============================================================================

export interface BudgetStatsApiResponse {
  summary: {
    actualIncome: number;
    actualExpense: number;
    balance: number;
    utilizationRate: number | null;
    transactionsCount: number;
    firstTransactionDate: string | null;
    lastTransactionDate: string | null;
  };
}

interface BudgetStatsInternal {
  summary: {
    actualIncome: number | Money;
    actualExpense: number | Money;
    balance: number | Money;
    utilizationRate: number | null;
    transactionsCount: number;
    firstTransactionDate: string | null;
    lastTransactionDate: string | null;
  };
}

/**
 * Serialize budget stats to API decimal format
 */
export function serializeBudgetStats(stats: BudgetStatsInternal): BudgetStatsApiResponse {
  return {
    summary: {
      actualIncome: centsToApiDecimal(stats.summary.actualIncome),
      actualExpense: centsToApiDecimal(stats.summary.actualExpense),
      balance: centsToApiDecimal(stats.summary.balance),
      utilizationRate: stats.summary.utilizationRate,
      transactionsCount: stats.summary.transactionsCount,
      firstTransactionDate: stats.summary.firstTransactionDate,
      lastTransactionDate: stats.summary.lastTransactionDate,
    },
  };
}
