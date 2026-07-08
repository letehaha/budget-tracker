import { AccountModel, CategoryModel, TransactionModel } from './db-models';
import { ACCOUNT_STATUSES, ACCOUNT_TYPES, FILTER_OPERATION, SORT_DIRECTIONS, TRANSACTION_TYPES } from './enums';
import { RecordId } from './record-id';

export type BodyPayload = {
  [key: string | number]: string | number | boolean | undefined;
};
export type QueryPayload = {
  [key: string]: string | number | boolean | undefined;
};

export interface CreateAccountBody extends BodyPayload {
  accountCategory: AccountModel['accountCategory'];
  currencyCode: AccountModel['currencyCode'];
  name: AccountModel['name'];
  initialBalance: AccountModel['initialBalance'];
  creditLimit: AccountModel['creditLimit'];
  type?: AccountModel['type'];
}

export interface UpdateAccountBody extends BodyPayload {
  accountCategory?: AccountModel['accountCategory'];
  name?: AccountModel['name'];
  currentBalance?: AccountModel['currentBalance'];
  creditLimit?: AccountModel['creditLimit'];
  status?: ACCOUNT_STATUSES;
  excludeFromStats?: boolean;
}

export interface GetBalanceHistoryPayload extends QueryPayload {
  accountId?: AccountModel['id'];
  // yyyy-mm-dd
  from?: string;
  // yyyy-mm-dd
  to?: string;
}

export interface GetTotalBalancePayload extends QueryPayload {
  date: string;
}

export interface GetSpendingCategoriesPayload extends QueryPayload {
  accountId?: AccountModel['id'];
  // yyyy-mm-dd
  from?: string;
  // yyyy-mm-dd
  to?: string;
  raw?: boolean;
}

export type SpendingStructure = { name: string; color: string; amount: number };
export type GetSpendingsByCategoriesReturnType = {
  [categoryId: RecordId]: SpendingStructure;
};

export type SpendingStructureByType = { name: string; color: string; income: number; expense: number };
export type GetSpendingsByCategoriesByTypeReturnType = {
  [categoryId: RecordId]: SpendingStructureByType;
};

export interface GetTransactionsQuery extends QueryPayload {
  sort?: SORT_DIRECTIONS;
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
  limit?: number;
  from?: number;
  type?: TRANSACTION_TYPES;
  accountType?: ACCOUNT_TYPES;
  accountId?: AccountModel['id'];
  excludeTransfer?: boolean;
  excludeRefunds?: boolean;
  transferFilter?: FILTER_OPERATION;
  refundFilter?: FILTER_OPERATION;
}

export type GetTransactionsResponse = TransactionModel[];

export interface SplitInput {
  categoryId: RecordId;
  amount: number;
  note?: string | null;
}

export interface CreateTransactionBody {
  amount: TransactionModel['amount'];
  note?: TransactionModel['note'];
  time: string;
  transactionType: TransactionModel['transactionType'];
  paymentType: TransactionModel['paymentType'];
  accountId: TransactionModel['accountId'];
  categoryId?: TransactionModel['categoryId'];
  destinationAccountId?: TransactionModel['accountId'];
  destinationAmount?: TransactionModel['amount'];
  destinationTransactionId?: RecordId;
  commissionRate?: TransactionModel['commissionRate'];
  transferNature?: TransactionModel['transferNature'];
  // When transaction is being created, it can be marked as a refund for another transaction
  refundForTxId?: RecordId;
  // When refunding a split specifically (required when original tx has splits)
  refundForSplitId?: RecordId;
  // Optional splits for multi-category transactions
  splits?: SplitInput[];
  // Optional tag IDs to associate with the transaction
  tagIds?: string[];
  /** Pre-resolved Payee — typically null for manual creates; set by provider sync. */
  payeeId?: RecordId | null;
  /** True when the caller wants future syncs to leave this row's Payee link alone. */
  payeeLocked?: boolean;
}

export interface UpdateTransactionBody {
  amount?: TransactionModel['amount'];
  destinationAmount?: TransactionModel['amount'];
  destinationTransactionId?: TransactionModel['id'];
  note?: TransactionModel['note'];
  time?: string;
  transactionType?: TransactionModel['transactionType'];
  paymentType?: TransactionModel['paymentType'];
  accountId?: TransactionModel['accountId'];
  destinationAccountId?: TransactionModel['accountId'];
  categoryId?: TransactionModel['categoryId'];
  transferNature?: TransactionModel['transferNature'];
  // Pass tx id if you want to mark which tx it refunds
  refundsTxId?: RecordId | null;
  // When refunding a split specifically (required when original tx has splits)
  refundsSplitId?: RecordId | null;
  // Pass tx ids that will refund the source tx (with optional splitId for each)
  refundedByTxIds?: string[] | null;
  // Mapping of refundTxId -> splitId for split-specific refunds
  refundedBySplitIds?: Record<string, string> | null;
  // Optional splits for multi-category transactions (null to clear all splits)
  splits?: SplitInput[] | null;
  // Optional tag IDs to associate with the transaction (null to clear all tags)
  tagIds?: string[] | null;
  payeeId?: RecordId | null;
  payeeLocked?: boolean;
}

export interface UnlinkTransferTransactionsBody {
  transferIds: string[];
}
// Array of income/expense pairs to link between each other. It's better to pass
// exactly exactly as described in the type, but in fact doesn't really matter
export interface LinkTransactionsBody {
  ids: [baseTxId: RecordId, destinationTxId: RecordId][];
}

export type BulkUpdateTagMode = 'add' | 'replace' | 'remove';

export interface BulkUpdateTransactionsBody {
  transactionIds: string[];
  categoryId?: RecordId;
  tagIds?: string[];
  tagMode?: BulkUpdateTagMode;
  note?: string;
  // Nullable: explicit `null` clears the Payee, undefined leaves it untouched.
  payeeId?: RecordId | null;
}

export interface BulkUpdateTransactionsResponse {
  updatedCount: number;
  updatedIds: string[];
}

// Backward compatibility aliases
export type BulkUpdateTransactionsCategoryBody = BulkUpdateTransactionsBody;
export type BulkUpdateTransactionsCategoryResponse = BulkUpdateTransactionsResponse;

export interface BulkDeleteTransactionsBody {
  transactionIds: string[];
}

export interface BulkDeleteTransactionsResponse {
  deletedCount: number;
  deletedIds: string[];
}

export type CreateCategoryBody = {
  name: CategoryModel['name'];
  color?: CategoryModel['color'];
  icon?: CategoryModel['icon'];
  parentId?: CategoryModel['parentId'];
};
export type CreateCategoryResponse = CategoryModel;

export type EditCategoryBody = Partial<Pick<CategoryModel, 'name' | 'color' | 'icon'>>;
export type EditCategoryResponse = CategoryModel[];

export interface DeleteCategoryBody {
  replaceWithCategoryId?: RecordId;
}

export interface DeleteCategoryConflictResponse {
  transactionCount: number;
}

// Cash Flow Analytics
export type CashFlowGranularity = 'monthly' | 'biweekly' | 'weekly';

export interface GetCashFlowPayload extends QueryPayload {
  // yyyy-mm-dd (required)
  from: string;
  // yyyy-mm-dd (required)
  to: string;
  granularity: CashFlowGranularity;
  accountId?: AccountModel['id'];
  // Filter to specific categories (comma-separated IDs).
  categoryIds?: string;
}

// Category breakdown within a period
export interface CashFlowCategoryData {
  categoryId: RecordId;
  name: string;
  color: string;
  // Separate amounts by transaction type for proper filtering
  incomeAmount: number;
  expenseAmount: number;
}

export interface CashFlowPeriodData {
  // yyyy-mm-dd
  periodStart: string;
  // yyyy-mm-dd
  periodEnd: string;
  income: number;
  expenses: number;
  netFlow: number;
  // Per-category breakdown (only present when categoryIds filter is used)
  categories?: CashFlowCategoryData[];
}

export interface GetCashFlowResponse {
  periods: CashFlowPeriodData[];
  totals: {
    income: number;
    expenses: number;
    netFlow: number;
    // percentage (0-100)
    savingsRate: number;
  };
}

// Pivot Report Analytics
// A cross-tab of a row dimension (category / category+subcategory / payee / tag)
// against a time dimension (year / quarter / month / week), summing refAmount in
// the user's base currency. Deltas, heatmap intensity and sorting are derived on
// the client from the returned matrix.
// Single source of truth for the pivot enums. The Zod validators (request query + saved-view
// settings schema) build their `z.enum(...)` straight off these tuples, so adding a member here
// can't silently drift out of sync with what the API accepts.
export const PIVOT_GRANULARITIES = ['yearly', 'quarterly', 'monthly', 'weekly'] as const;
export type PivotGranularity = (typeof PIVOT_GRANULARITIES)[number];
export const PIVOT_ROW_DIMENSIONS = ['category', 'subcategory', 'payee', 'tag'] as const;
export type PivotRowDimension = (typeof PIVOT_ROW_DIMENSIONS)[number];
export const PIVOT_MEASURES = ['expense', 'income'] as const;
export type PivotMeasure = (typeof PIVOT_MEASURES)[number];

// Max length of a saved Pivot view's user-facing name. Shared by the backend Zod
// schema and the client-side input cap so both reject the same overflow rather
// than the client letting the user type a name the server will 400 on.
export const SAVED_PIVOT_VIEW_NAME_MAX_LENGTH = 120;

export interface GetPivotReportPayload extends QueryPayload {
  // yyyy-mm-dd (required)
  from: string;
  // yyyy-mm-dd (required)
  to: string;
  granularity: PivotGranularity;
  rowDimension: PivotRowDimension;
  measure: PivotMeasure;
  // Comma-separated filter IDs (all optional; omitted = no restriction).
  accountIds?: string;
  categoryIds?: string;
  payeeIds?: string;
}

// One time bucket = one column of the pivot grid.
export interface PivotColumn {
  // Stable identity used to key row values, e.g. '2025' | '2025-Q1' | '2025-03' | '2025-03-03'
  // (weekly keys are the week's Monday as yyyy-MM-dd).
  key: string;
  // yyyy-mm-dd (clamped to the requested range at the edges).
  periodStart: string;
  // yyyy-mm-dd
  periodEnd: string;
  // Non-localized default label ('2025', 'Q1 2025', 'Mar 2025', 'Wk of 2025-03-03').
  // The client may reformat/localize from periodStart + granularity.
  label: string;
}

export interface PivotRow {
  // categoryId | payeeId | tagId, or a synthetic bucket id for the residual row
  // ('uncategorized' | 'unassigned' | 'untagged').
  id: string;
  label: string;
  // Hex color when the dimension carries one (categories), else null.
  color: string | null;
  // Brand domain (e.g. "netflix.com") for the payee dimension, so the client can render the
  // payee's logo; null when the payee has no resolved logo. Absent for every other dimension.
  logoDomain?: string | null;
  // Subcategory child rows point at their parent row id; parents/flat rows are null.
  parentId: string | null;
  kind: 'flat' | 'parent' | 'child';
  // columnKey -> amount (decimal, base currency).
  values: Record<string, number>;
  // Row total across all columns (decimal).
  total: number;
}

export interface GetPivotReportResponse {
  columns: PivotColumn[];
  rows: PivotRow[];
  // columnKey -> total across all top-level rows (decimal).
  columnTotals: Record<string, number>;
  grandTotal: number;
  // Base/reference currency all amounts are expressed in.
  currencyCode: string;
}

// A saved Pivot Report "view": the full configuration a user pinned so they can reopen the same
// cross-tab later. Persisted in the user-settings JSONB (no dedicated table); the backend Zod
// schema (`ZodSavedPivotViewConfigSchema`) is asserted to infer exactly this shape, and the
// frontend re-exports these so both ends share one contract.
export interface SavedPivotViewConfig {
  rowDimension: PivotRowDimension;
  granularity: PivotGranularity;
  measure: PivotMeasure;
  // Explicit period range as `yyyy-MM-dd` strings.
  from: string;
  to: string;
  accountIds?: string[];
  categoryIds?: string[];
  payeeIds?: string[];
  heatmap: boolean;
  showDelta: boolean;
}

export interface SavedPivotView {
  id: string;
  name: string;
  config: SavedPivotViewConfig;
}

// Per-section visibility for the sidebar's Accounts panel (Bank Accounts is always shown and
// intentionally absent). Persisted in the user-settings JSONB; the backend Zod schema
// (`ZodSidebarSectionsSchema`) is asserted to infer exactly this shape, and the frontend
// re-exports it, so both ends share one contract and cannot drift.
export interface SidebarSectionsConfig {
  portfolios: boolean;
  ventures: boolean;
  vehicles: boolean;
  loans: boolean;
}

// Cumulative Analytics (Trends Comparison)
export type CumulativeMetric = 'expenses' | 'income' | 'savings';

export interface GetCumulativePayload extends QueryPayload {
  // yyyy-mm-dd (required)
  from: string;
  // yyyy-mm-dd (required)
  to: string;
  metric: CumulativeMetric;
  accountId?: AccountModel['id'];
}

export interface CumulativeMonthData {
  month: number; // 1-12
  monthLabel: string; // "Jan", "Feb", etc.
  value: number; // cumulative value up to this month
  periodValue: number; // value for just this month
}

export interface CumulativePeriodData {
  year: number; // Year from the period start date (for reference)
  data: CumulativeMonthData[];
  total: number;
}

export interface GetCumulativeResponse {
  currentPeriod: CumulativePeriodData;
  previousPeriod: CumulativePeriodData;
  percentChange: number; // Period-over-period total change %
}

// Refund Recommendations
// Either transactionId OR (transactionType + originAmount + accountId) must be provided
export interface GetRefundRecommendationsQuery extends QueryPayload {
  // Option 1: Provide transaction ID - backend derives everything
  transactionId?: RecordId;
  // Option 2: Provide form data for new transactions
  // The transaction type to search for (opposite of current tx)
  transactionType?: TRANSACTION_TYPES;
  // Origin transaction amount (in decimal, not cents)
  originAmount?: number;
  // Account ID to derive currency for refAmount calculation
  accountId?: RecordId;
}

export type GetRefundRecommendationsResponse = TransactionModel[];

export type GetTransferRecommendationsResponse = TransactionModel[];

// Bulk Transfer Scan
export interface BulkTransferScanBody {
  dateFrom: string;
  dateTo: string;
  limit?: number;
  offset?: number;
  includeOutOfWallet?: boolean;
}

export interface BulkTransferScanMatch {
  transaction: TransactionModel;
  confidence: number;
}

export interface BulkTransferScanItem {
  expense: TransactionModel;
  matches: BulkTransferScanMatch[];
}

export interface BulkTransferScanResponse {
  total: number;
  items: BulkTransferScanItem[];
}

// Transfer Suggestion Dismissals
export interface DismissTransferSuggestionBody {
  expenseTransactionId: RecordId;
  incomeTransactionId: RecordId;
}

// Budget Spending Stats
export interface BudgetSpendingByCategoryItem {
  categoryId: RecordId;
  name: string;
  color: string;
  amount: number; // decimal, positive (expenses only)
  children?: BudgetSpendingByCategoryItem[];
}

export interface BudgetSpendingPeriod {
  periodStart: string; // yyyy-MM-dd
  periodEnd: string;
  expense: number; // decimal, positive
  income: number; // decimal, positive
}

export interface BudgetSpendingStatsResponse {
  spendingsByCategory: BudgetSpendingByCategoryItem[];
  spendingOverTime: {
    granularity: 'monthly' | 'weekly';
    periods: BudgetSpendingPeriod[];
  };
}
