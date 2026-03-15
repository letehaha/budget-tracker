/**
 * Import/Export shared types
 * These types are used by both frontend and backend for CSV import functionality
 */
import type { Cents } from './money';

/**
 * Import source types for imported transactions
 */
export enum ImportSource {
  csv = 'csv',
  statementParser = 'statement-parser',
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
  | { option: CategoryOptionValue.existingCategory; categoryId: number };

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
  | { option: AccountOptionValue.existingAccount; accountId: number };

/**
 * Column mapping configuration for Step 2
 */
export interface ColumnMappingConfig {
  date: string;
  amount: string;
  description?: string;
  category: CategoryOption;
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
  /** Currency mismatch warning when user selected existing account with different currency */
  currencyMismatchWarning?: string;
}

/**
 * Account mapping for import - maps CSV account name to action
 */
export type AccountMappingValue = { action: 'create-new' } | { action: 'link-existing'; accountId: number };

export type AccountMappingConfig = Record<string, AccountMappingValue>;

/**
 * Category mapping for import - maps CSV category name to action
 */
export type CategoryMappingValue = { action: 'create-new' } | { action: 'link-existing'; categoryId: number };

export type CategoryMappingConfig = Record<string, CategoryMappingValue>;

/**
 * Parsed transaction row ready for duplicate detection
 */
export interface ParsedTransactionRow {
  rowIndex: number;
  date: string; // ISO format
  amount: Cents;
  description: string;
  categoryName?: string;
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
    id: number;
    date: string;
    amount: Cents;
    note: string;
    accountId: number;
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
}

/**
 * Response from duplicate detection
 */
export interface DetectDuplicatesResponse {
  validRows: ParsedTransactionRow[];
  invalidRows: InvalidRow[];
  duplicates: DuplicateMatch[];
}

/**
 * Request for import execution
 */
export interface ExecuteImportRequest {
  validRows: ParsedTransactionRow[];
  accountMapping: AccountMappingConfig;
  categoryMapping: CategoryMappingConfig;
  /** Row indices to skip (confirmed duplicates) */
  skipDuplicateIndices: number[];
}

/**
 * Import error for a specific row
 */
export interface ImportError {
  rowIndex: number;
  error: string;
}

/**
 * Response from import execution
 */
export interface ExecuteImportResponse {
  summary: {
    imported: number;
    skipped: number;
    accountsCreated: number;
    categoriesCreated: number;
    errors: ImportError[];
  };
  newTransactionIds: number[];
  batchId: string;
}
