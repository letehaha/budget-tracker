import type {
  AccountMappingConfig,
  CategoryMappingConfig,
  ColumnMappingConfig,
  DetectDuplicatesResponse,
  DetectWalletDuplicatesResponse,
  ExecuteImportResponse,
  ExecuteYnabResponse,
  ExecuteWalletResponse,
  ExtractUniqueValuesResponse,
  ExtractedMetadata,
  ExtractedTransaction,
  ParsedTransactionRow,
  ParseYnabResponse,
  ParseWalletResponse,
  StatementDetectDuplicatesResponse,
  StatementExecuteImportResponse,
  TagMappingConfig,
  WalletAccountMapping,
  WalletImportProgress,
  YnabAccountMapping,
  YnabImportProgress,
} from '@bt/shared/types';
import fs from 'fs';
import path from 'path';

import { type UtilizeReturnType, makeRequest } from './common';

// Path to CSV fixtures
const FIXTURES_PATH = path.join(__dirname, '../fixtures/csv-import');
const STATEMENT_FIXTURES_PATH = path.join(__dirname, '../fixtures');
const YNAB_FIXTURES_PATH = path.join(__dirname, '../fixtures/ynab-import');
const WALLET_FIXTURES_PATH = path.join(__dirname, '../fixtures/wallet-import');

/** Load a YNAB Register.csv fixture by filename. */
export function loadYnabFixture(filename: string): string {
  const filePath = path.join(YNAB_FIXTURES_PATH, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Load a statement fixture file by name (JSON format)
 */
export function loadStatementFixture(filename: string): {
  transactions: ExtractedTransaction[];
  metadata: ExtractedMetadata;
} {
  const filePath = path.join(STATEMENT_FIXTURES_PATH, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Load a CSV fixture file by name
 */
export function loadCsvFixture(filename: string): string {
  const filePath = path.join(FIXTURES_PATH, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

// ============================================
// Parse CSV Endpoint
// ============================================

interface ParseCsvResponse {
  headers: string[];
  preview: Record<string, string>[];
  detectedDelimiter: string;
  totalRows: number;
}

interface ParseCsvParams {
  fileContent: string;
  delimiter?: string;
}

export function parseCsv<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: ParseCsvParams;
  raw?: R;
}): UtilizeReturnType<() => ParseCsvResponse, R> {
  return makeRequest<ParseCsvResponse, R>({
    method: 'post',
    url: '/import/csv/parse',
    payload,
    raw,
  });
}

// ============================================
// Extract Unique Values Endpoint
// ============================================

interface ExtractUniqueValuesParams {
  fileContent: string;
  delimiter: string;
  columnMapping: ColumnMappingConfig;
}

export function extractUniqueValues<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: ExtractUniqueValuesParams;
  raw?: R;
}): UtilizeReturnType<() => ExtractUniqueValuesResponse, R> {
  return makeRequest<ExtractUniqueValuesResponse, R>({
    method: 'post',
    url: '/import/csv/extract-unique-values',
    payload,
    raw,
  });
}

// ============================================
// Detect Duplicates Endpoint
// ============================================

interface DetectDuplicatesParams {
  fileContent: string;
  delimiter: string;
  columnMapping: ColumnMappingConfig;
  accountMapping: AccountMappingConfig;
  categoryMapping: CategoryMappingConfig;
  tagMapping?: TagMappingConfig;
  /** IANA timezone (e.g. `America/Montevideo`) used to anchor date-only cells. */
  timezone?: string;
}

export function detectDuplicates<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: DetectDuplicatesParams;
  raw?: R;
}): UtilizeReturnType<() => DetectDuplicatesResponse, R> {
  return makeRequest<DetectDuplicatesResponse, R>({
    method: 'post',
    url: '/import/csv/detect-duplicates',
    payload,
    raw,
  });
}

// ============================================
// Execute Import Endpoint
// ============================================

interface ExecuteImportParams {
  validRows: ParsedTransactionRow[];
  accountMapping: AccountMappingConfig;
  categoryMapping: CategoryMappingConfig;
  tagMapping?: TagMappingConfig;
  skipDuplicateIndices: number[];
  skipUnpriceableIndices?: number[];
  defaultAccountId?: string;
  defaultCategoryId?: string;
}

export function executeImport<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: ExecuteImportParams;
  raw?: R;
}): UtilizeReturnType<() => ExecuteImportResponse, R> {
  return makeRequest<ExecuteImportResponse, R>({
    method: 'post',
    url: '/import/csv/execute',
    payload,
    raw,
  });
}

// ============================================
// Statement Parser - Detect Duplicates Endpoint
// ============================================

interface StatementDetectDuplicatesParams {
  accountId: string;
  transactions: ExtractedTransaction[];
}

export function statementDetectDuplicates<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: StatementDetectDuplicatesParams;
  raw?: R;
}): UtilizeReturnType<() => StatementDetectDuplicatesResponse, R> {
  return makeRequest<StatementDetectDuplicatesResponse, R>({
    method: 'post',
    url: '/import/text-source/detect-duplicates',
    payload,
    raw,
  });
}

// ============================================
// Statement Parser - Execute Import Endpoint
// ============================================

interface StatementExecuteImportParams {
  accountId: string;
  transactions: ExtractedTransaction[];
  skipIndices: number[];
}

export function statementExecuteImport<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: StatementExecuteImportParams;
  raw?: R;
}): UtilizeReturnType<() => StatementExecuteImportResponse, R> {
  return makeRequest<StatementExecuteImportResponse, R>({
    method: 'post',
    url: '/import/text-source/execute',
    payload,
    raw,
  });
}

// ============================================
// YNAB Import - Parse Endpoint
// ============================================

interface ParseYnabParams {
  fileContent: string;
}

export function parseYnab<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: ParseYnabParams;
  raw?: R;
}): UtilizeReturnType<() => ParseYnabResponse, R> {
  return makeRequest<ParseYnabResponse, R>({
    method: 'post',
    url: '/import/ynab/parse',
    payload,
    raw,
  });
}

// ============================================
// YNAB Import - Execute Endpoint
// ============================================

interface ExecuteYnabParams {
  fileContent: string;
  accountMapping: YnabAccountMapping;
}

export function executeYnab<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: ExecuteYnabParams;
  raw?: R;
}): UtilizeReturnType<() => ExecuteYnabResponse, R> {
  return makeRequest<ExecuteYnabResponse, R>({
    method: 'post',
    url: '/import/ynab/execute',
    payload,
    raw,
  });
}

// ============================================
// YNAB Import - Status Endpoint
// ============================================

export function getYnabImportStatus<R extends boolean | undefined = false>({
  jobId,
  raw,
}: {
  jobId: string;
  raw?: R;
}): UtilizeReturnType<() => YnabImportProgress, R> {
  return makeRequest<YnabImportProgress, R>({
    method: 'get',
    url: `/import/ynab/status/${jobId}`,
    raw,
  });
}

// ============================================
// Wallet Import - Fixture Loader
// ============================================

/** Load a Wallet (BudgetBakers) CSV fixture by filename. */
export function loadWalletFixture(filename: string): string {
  const filePath = path.join(WALLET_FIXTURES_PATH, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

// ============================================
// Wallet Import - Parse Endpoint
// ============================================

interface ParseWalletParams {
  fileContent: string;
}

export function parseWallet<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: ParseWalletParams;
  raw?: R;
}): UtilizeReturnType<() => ParseWalletResponse, R> {
  return makeRequest<ParseWalletResponse, R>({
    method: 'post',
    url: '/import/wallet/parse',
    payload,
    raw,
  });
}

// ============================================
// Wallet Import - Detect Duplicates Endpoint
// ============================================

interface DetectWalletDuplicatesParams {
  fileContent: string;
  accountMapping: WalletAccountMapping;
}

export function detectWalletDuplicates<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: DetectWalletDuplicatesParams;
  raw?: R;
}): UtilizeReturnType<() => DetectWalletDuplicatesResponse, R> {
  return makeRequest<DetectWalletDuplicatesResponse, R>({
    method: 'post',
    url: '/import/wallet/detect-duplicates',
    payload,
    raw,
  });
}

// ============================================
// Wallet Import - Execute Endpoint
// ============================================

interface ExecuteWalletParams {
  fileContent: string;
  accountMapping: WalletAccountMapping;
  /** Per-category decision keyed by the verbatim Wallet `category` value.
   *  Defaults to `{}` so existing callers that omit it still satisfy the
   *  backend's required field — an empty record is valid (all parsed categories
   *  import without a category rather than being silently created). */
  categoryMapping?: CategoryMappingConfig;
  skipDuplicateIndices?: number[];
}

export function executeWallet<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: ExecuteWalletParams;
  raw?: R;
}): UtilizeReturnType<() => ExecuteWalletResponse, R> {
  // `?? []` / `?? {}` guard against a caller passing the field as `undefined`,
  // which would otherwise overwrite the safe default and fail Zod validation.
  const { skipDuplicateIndices, categoryMapping, ...rest } = payload;
  return makeRequest<ExecuteWalletResponse, R>({
    method: 'post',
    url: '/import/wallet/execute',
    payload: {
      ...rest,
      skipDuplicateIndices: skipDuplicateIndices ?? [],
      categoryMapping: categoryMapping ?? {},
    },
    raw,
  });
}

// ============================================
// Wallet Import - Status Endpoint
// ============================================

export function getWalletImportStatus<R extends boolean | undefined = false>({
  jobId,
  raw,
}: {
  jobId: string;
  raw?: R;
}): UtilizeReturnType<() => WalletImportProgress, R> {
  return makeRequest<WalletImportProgress, R>({
    method: 'get',
    url: `/import/wallet/status/${jobId}`,
    raw,
  });
}

// ============================================
// Wallet Import - Shared polling helper
// ============================================

/**
 * Poll GET /import/wallet/status/:jobId every 100 ms until the job leaves the
 * running/queued states or the timeout elapses. The BullMQ worker is async, so
 * the execute response only carries `jobId` — callers must poll for the result.
 *
 * A single shared implementation avoids divergent timeouts across test files
 * (detect-duplicates and execute-import both need it).
 */
export async function waitForWalletCompletion({
  jobId,
  timeoutMs = 30_000,
}: {
  jobId: string;
  timeoutMs?: number;
}): Promise<WalletImportProgress> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const progress = await getWalletImportStatus({ jobId, raw: true });
    if (progress.status === 'completed' || progress.status === 'failed') {
      return progress;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Wallet import job ${jobId} did not finish within ${timeoutMs}ms`);
}

/**
 * Narrow terminal progress to the `completed` branch so tests can read `summary`
 * directly without an extra type guard. Throws (failing the calling test) when
 * the worker finished with `status:'failed'`, surfacing the error string for
 * quick debugging. Shared so detect-duplicates and execute-import tests assert
 * completion identically.
 */
export function expectCompleted(
  progress: WalletImportProgress,
): asserts progress is Extract<WalletImportProgress, { status: 'completed' }> {
  if (progress.status !== 'completed') {
    const detail = progress.status === 'failed' ? ` Error: ${progress.error}` : '';
    throw new Error(`Expected completed import, got status="${progress.status}".${detail}`);
  }
}
