/**
 * Budget Serializers
 *
 * Handles conversion between internal cents representation and API decimal format.
 * - Serializers: DB (cents) → API (decimal)
 * - Deserializers: API (decimal) → DB (cents)
 */
import { type CentsAmount, type DecimalAmount, asCents, parseToCents, toDecimal } from '@bt/shared/types';
import type Budgets from '@models/Budget.model';

// ============================================================================
// Response Types (API format with DecimalAmount)
// ============================================================================

export interface BudgetApiResponse {
  id: number;
  name: string;
  status: string;
  categoryName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  autoInclude: boolean;
  limitAmount: DecimalAmount | null;
  userId: number;
}

// ============================================================================
// Request Types (API format with decimal input)
// ============================================================================

export interface CreateBudgetRequest {
  name: string;
  status?: string;
  categoryName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  autoInclude?: boolean;
  limitAmount?: number | null; // decimal from API
}

export interface UpdateBudgetRequest {
  name?: string;
  status?: string;
  categoryName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  autoInclude?: boolean;
  limitAmount?: number | null; // decimal from API
}

// ============================================================================
// Internal Types (DB format with CentsAmount)
// ============================================================================

export interface CreateBudgetInternal {
  name: string;
  status?: string;
  categoryName?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  autoInclude?: boolean;
  limitAmount?: CentsAmount | null;
  userId: number;
}

export interface UpdateBudgetInternal {
  name?: string;
  status?: string;
  categoryName?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  autoInclude?: boolean;
  limitAmount?: CentsAmount | null;
}

// ============================================================================
// Serializers (DB → API)
// ============================================================================

/**
 * Serialize a budget from DB format to API response
 */
export function serializeBudget(budget: Budgets): BudgetApiResponse {
  return {
    id: budget.id,
    name: budget.name,
    status: budget.status,
    categoryName: budget.categoryName,
    startDate: budget.startDate,
    endDate: budget.endDate,
    autoInclude: budget.autoInclude,
    limitAmount: budget.limitAmount !== null ? toDecimal(asCents(budget.limitAmount)) : null,
    userId: budget.userId,
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
    categoryName: req.categoryName,
    startDate: req.startDate ? new Date(req.startDate) : undefined,
    endDate: req.endDate ? new Date(req.endDate) : undefined,
    autoInclude: req.autoInclude,
    limitAmount: req.limitAmount !== undefined && req.limitAmount !== null ? parseToCents(req.limitAmount) : undefined,
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
    categoryName: req.categoryName,
    startDate: req.startDate ? new Date(req.startDate) : req.startDate === null ? null : undefined,
    endDate: req.endDate ? new Date(req.endDate) : req.endDate === null ? null : undefined,
    autoInclude: req.autoInclude,
    limitAmount:
      req.limitAmount !== undefined ? (req.limitAmount !== null ? parseToCents(req.limitAmount) : null) : undefined,
  };
}

// ============================================================================
// Budget Stats Serializer
// ============================================================================

export interface BudgetStatsApiResponse {
  summary: {
    actualIncome: DecimalAmount;
    actualExpense: DecimalAmount;
    balance: DecimalAmount;
    utilizationRate: number | null;
    transactionsCount: number;
    firstTransactionDate: string | null;
    lastTransactionDate: string | null;
  };
}

interface BudgetStatsInternal {
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

/**
 * Serialize budget stats from internal cents format to API decimal format
 */
export function serializeBudgetStats(stats: BudgetStatsInternal): BudgetStatsApiResponse {
  return {
    summary: {
      actualIncome: toDecimal(asCents(stats.summary.actualIncome)),
      actualExpense: toDecimal(asCents(stats.summary.actualExpense)),
      balance: toDecimal(asCents(stats.summary.balance)),
      utilizationRate: stats.summary.utilizationRate,
      transactionsCount: stats.summary.transactionsCount,
      firstTransactionDate: stats.summary.firstTransactionDate,
      lastTransactionDate: stats.summary.lastTransactionDate,
    },
  };
}
