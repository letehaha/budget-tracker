import type {
  AccountMappingConfig,
  CategoryMappingConfig,
  ColumnMappingConfig,
  DetectDuplicatesResponse,
  ExecuteImportResponse,
  ExecuteYnabResponse,
  ExtractUniqueValuesResponse,
  ExtractedMetadata,
  ExtractedTransaction,
  ParsedTransactionRow,
  ParseYnabResponse,
  StatementDetectDuplicatesResponse,
  StatementExecuteImportResponse,
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
  skipDuplicateIndices: number[];
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
