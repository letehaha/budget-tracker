/**
 * Import/Export shared types
 * These types are used by both frontend and backend for CSV import functionality
 */
import type { Cents } from './money';

/**
 * Maximum data rows accepted from a single CSV upload. Same cap applied on the
 * client (pre-flight in the investments column-mapping step) and on the server
 * (bank- and investment-import parsers). Bumping this in one place reflects
 * everywhere.
 */
export const MAX_CSV_ROWS = 50_000;

/**
 * CSV header names we refuse to accept — they would alias `Object.prototype`
 * keys when used as object indices downstream. Shared so client and server
 * stay in sync.
 */
export const CSV_FORBIDDEN_HEADERS = ['__proto__', 'prototype', 'constructor'] as const;

/**
 * Lifecycle states a background import job moves through, from enqueue to
 * terminal outcome. Shared across the per-provider import pipelines (YNAB,
 * Wallet, …) so their job-status types stay identical instead of each
 * redeclaring the same four strings.
 */
export const IMPORT_JOB_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

/**
 * Import source types for imported transactions
 */
export enum ImportSource {
  csv = 'csv',
  statementParser = 'statement-parser',
  budgetBakersWallet = 'budget-bakers-wallet',
}

/**
 * Import details stored in transaction's externalData for imported transactions.
 * This is undefined/null for manually created transactions or bank-synced transactions.
 */
export interface TransactionImportDetails {
  /** Unique identifier for the import batch - groups all transactions from a single import */
  batchId: string;
  /** ISO timestamp when the import was executed */
  importedAt: string;
  /** Source of the import */
  source: ImportSource;
}

export enum CategoryOptionValue {
  mapDataSourceColumn = 'map-data-source-column',
  createNewCategories = 'create-new-categories',
  existingCategory = 'existing-category',
}

export enum TagOptionValue {
  mapDataSourceColumn = 'map-data-source-column',
}

export enum CurrencyOptionValue {
  dataSourceColumn = 'data-source-column',
  existingCurrency = 'existing-currency',
}

export enum TransactionTypeOptionValue {
  dataSourceColumn = 'data-source-column',
  amountSign = 'amount-sign',
}

export enum AccountOptionValue {
  dataSourceColumn = 'data-source-column',
  existingAccount = 'existing-account',
}

/**
 * Category assignment options for CSV import
 */
export type CategoryOption =
  | { option: CategoryOptionValue.mapDataSourceColumn; columnName: string }
  | { option: CategoryOptionValue.createNewCategories; columnName: string }
  | { option: CategoryOptionValue.existingCategory; categoryId: string };

/**
 * Tag assignment options for CSV import. Currently supports mapping a CSV
 * column whose comma-separated cell values become individual tags on each row.
 * Absence of tags is expressed by setting the column-mapping field to `null`.
 */
export type TagOption = { option: TagOptionValue.mapDataSourceColumn; columnName: string };

/**
 * Currency assignment options for CSV import
 */
export type CurrencyOption =
  | { option: CurrencyOptionValue.dataSourceColumn; columnName: string }
  | { option: CurrencyOptionValue.existingCurrency; currencyCode: string };

/**
 * Transaction type determination options
 */
export type TransactionTypeOption =
  | {
      option: TransactionTypeOptionValue.dataSourceColumn;
      columnName: string;
      incomeValues: string[];
      expenseValues: string[];
    }
  | { option: TransactionTypeOptionValue.amountSign };

/**
 * Account assignment options for CSV import
 */
export type AccountOption =
  | { option: AccountOptionValue.dataSourceColumn; columnName: string }
  | { option: AccountOptionValue.existingAccount; accountId: string };

/**
 * Day/month order of the ambiguous d/d/yyyy date family (e.g. `12.01.2026`).
 * Chosen explicitly by the user in the import wizard — auto-detection only
 * pre-suggests, it never decides. Intrinsically ordered shapes (ISO,
 * ISO-datetime, compact YYYYMMDD) ignore it.
 */
export type DateFieldOrder = 'day-first' | 'month-first';

/**
 * Column mapping configuration for Step 2
 */
export interface ColumnMappingConfig {
  date: string;
  /** User-confirmed day/month order applied to the whole `date` column. */
  dateFieldOrder: DateFieldOrder;
  amount: string;
  description?: string;
  /** Optional CSV column whose value becomes `rawMerchantName` on the imported
   *  transaction — drives Payee extraction + `payee_rule` auto-categorization. */
  payee?: string;
  category: CategoryOption;
  /** Optional tag column mapping. `null` means no tags are imported. */
  tags?: TagOption | null;
  currency: CurrencyOption;
  transactionType: TransactionTypeOption;
  account: AccountOption;
}

/**
 * Source account with currency info extracted from CSV
 */
export interface SourceAccount {
  name: string;
  currency: string;
}

/**
 * Response from backend after validating Step 2 data
 */
export interface ExtractUniqueValuesResponse {
  sourceAccounts: SourceAccount[];
  sourceCategories: string[];
  /** Distinct tag strings found across all parsed rows, for populating the tag-mapping table. */
  sourceTags: string[];
  /** Currency mismatch warning when user selected existing account with different currency */
  currencyMismatchWarning?: string;
}

/**
 * Account mapping for import - maps CSV account name to action
 */
export type AccountMappingValue = { action: 'create-new' } | { action: 'link-existing'; accountId: string };

export type AccountMappingConfig = Record<string, AccountMappingValue>;

/**
 * Category mapping for import - maps CSV category name to action
 */
export type CategoryMappingValue = { action: 'create-new' } | { action: 'link-existing'; categoryId: string };

export type CategoryMappingConfig = Record<string, CategoryMappingValue>;

/** A single row that cannot be priced by the exchange-rate layer. */
export interface UnpriceableRow {
  rowIndex: number;
  currencyCode: string;
}

/**
 * Tag mapping for import - maps a distinct source tag string to an action.
 * `skip` drops this source value rather than creating or linking a tag.
 */
export type TagMappingValue =
  | { action: 'create-new' }
  | { action: 'link-existing'; tagId: string }
  | { action: 'skip' };

/**
 * Maps each distinct source tag string to its import action.
 * Multiple source values may map to the same `tagId` — many-to-one is intentional.
 */
export type TagMappingConfig = Record<string, TagMappingValue>;

/**
 * Parsed transaction row ready for duplicate detection
 */
export interface ParsedTransactionRow {
  rowIndex: number;
  /**
   * ISO 8601 instant (e.g. `2026-06-01T15:00:00.000Z`) — the absolute moment the
   * transaction is stored at, already anchored to the importing user's timezone.
   * `execute-import` reconstructs it with `new Date(row.date)`.
   */
  date: string;
  amount: Cents;
  description: string;
  /** Raw value from the user-mapped Payee column, if mapping included one. */
  payeeName?: string;
  categoryName?: string;
  /** Tag strings split from the source tag cell (comma-delimited upstream). Absent when no tag column was mapped. */
  tagNames?: string[];
  accountName: string;
  currencyCode: string;
  transactionType: 'income' | 'expense';
}

/**
 * Invalid row with validation errors
 */
export interface InvalidRow {
  rowIndex: number;
  errors: string[];
  rawData: Record<string, string>;
}

/**
 * Duplicate match result
 */
export interface DuplicateMatch {
  rowIndex: number;
  importedTransaction: ParsedTransactionRow;
  existingTransaction: {
    id: string;
    date: string;
    amount: Cents;
    note: string;
    accountId: string;
  };
  matchType: 'originalId' | 'exact' | 'fuzzy';
  confidence: number; // 0-100
}

/**
 * Request for duplicate detection
 */
export interface DetectDuplicatesRequest {
  fileContent: string;
  delimiter: string;
  columnMapping: ColumnMappingConfig;
  accountMapping: AccountMappingConfig;
  categoryMapping: CategoryMappingConfig;
  tagMapping?: TagMappingConfig;
  /**
   * IANA timezone of the importing user's browser (e.g. `America/Montevideo`),
   * from `Intl.DateTimeFormat().resolvedOptions().timeZone`. Anchors date-only
   * and zone-less datetime cells to the right calendar day. Optional — absent or
   * invalid values fall back to UTC anchoring on the backend.
   */
  timezone?: string;
}

/**
 * Response from duplicate detection
 */
export interface DetectDuplicatesResponse {
  validRows: ParsedTransactionRow[];
  invalidRows: InvalidRow[];
  duplicates: DuplicateMatch[];
  /**
   * Rows whose currency has no stored exchange rate and is neither USD nor the
   * user's base currency. The preview layer uses this to offer skip/abort.
   * Only present when at least one such row exists.
   */
  unpriceableRows?: UnpriceableRow[];
}

/**
 * Request for import execution. The CSV execute step is asynchronous: the
 * request carries the raw `fileContent` + mapping (NOT pre-parsed `validRows`),
 * the server enqueues a background job and re-parses the file inside the worker
 * via the same `parseValidRows` the interactive detect-duplicates step uses.
 * `parseValidRows` is deterministic, so the skip indices the user picked against
 * the preview stay valid against the worker's fresh re-parse.
 */
export interface ExecuteImportRequest {
  fileContent: string;
  delimiter: string;
  columnMapping: ColumnMappingConfig;
  accountMapping: AccountMappingConfig;
  categoryMapping: CategoryMappingConfig;
  tagMapping?: TagMappingConfig;
  /** Row indices to skip (confirmed duplicates) */
  skipDuplicateIndices: number[];
  /**
   * Row indices for unpriceable rows the user chose to skip rather than abort.
   * Uses the same rowIndex space as skipDuplicateIndices and
   * DetectDuplicatesResponse.unpriceableRows[].rowIndex.
   */
  skipUnpriceableIndices?: number[];
  /** Fallback account for rows whose accountName is empty (used when "single existing account" was chosen) */
  defaultAccountId?: string;
  /** Fallback category for rows whose categoryName is empty (used when "single existing category" was chosen) */
  defaultCategoryId?: string;
  /**
   * IANA timezone of the importing user's browser. Forwarded to `parseValidRows`
   * so the worker anchors dates to the same instants the preview computed.
   */
  timezone?: string;
}

/**
 * The CSV execute endpoint enqueues a background job and returns its id. The
 * client follows progress over SSE (`CSV_IMPORT_PROGRESS`) and/or by polling the
 * status endpoint.
 */
export interface ExecuteImportResponse {
  jobId: string;
}

/**
 * Import error for a specific row
 */
export interface ImportError {
  rowIndex: number;
  error: string;
}

/**
 * Cumulative numbers the CSV import worker reports once it finishes. Carried in
 * the `completed` SSE event and the status endpoint's `completed` payload, so
 * `newTransactionIds`/`batchId` survive to the client without a separate fetch.
 */
export interface CsvImportSummary {
  imported: number;
  /** Number of duplicate rows skipped (from skipDuplicateIndices) */
  skipped: number;
  /** Number of unpriceable rows skipped (from skipUnpriceableIndices) */
  skippedUnpriceable: number;
  accountsCreated: number;
  categoriesCreated: number;
  tagsCreated: number;
  /** Number of Payees inserted by this import. Reused/linked Payees don't count. */
  payeesCreated: number;
  errors: ImportError[];
  /** Ids of every transaction created by this import. */
  newTransactionIds: string[];
  /** Batch id stamped on every imported transaction's import details. */
  batchId: string;
}

/** Common counters every CSV import progress event carries. */
interface CsvImportProgressBase {
  jobId: string;
  /** Rows committed so far — one tick per successfully created transaction. */
  processedCount: number;
  /** Expected total — the number of rows that will actually be imported. */
  totalCount: number;
}

/**
 * SSE payload and GET /status response share the same envelope. Discriminated
 * over `status` so `summary` is guaranteed when completed and `error` is
 * guaranteed when failed — callers narrow once and read straight through.
 */
export type CsvImportProgress =
  | (CsvImportProgressBase & { status: 'queued' | 'running' })
  | (CsvImportProgressBase & { status: 'completed'; summary: CsvImportSummary })
  | (CsvImportProgressBase & { status: 'failed'; error: string });
