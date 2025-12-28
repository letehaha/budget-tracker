import type {
  AccountMappingConfig,
  CategoryMappingConfig,
  ColumnMappingConfig,
  DetectDuplicatesResponse,
  ExecuteImportResponse,
  ExtractUniqueValuesResponse,
  ExtractedMetadata,
  ExtractedTransaction,
  ParsedTransactionRow,
  StatementDetectDuplicatesResponse,
  StatementExecuteImportResponse,
} from '@bt/shared/types';
import fs from 'fs';
import path from 'path';

import { type UtilizeReturnType, makeRequest } from './common';

// Path to CSV fixtures
const FIXTURES_PATH = path.join(__dirname, '../fixtures/csv-import');
const STATEMENT_FIXTURES_PATH = path.join(__dirname, '../fixtures');

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
  accountId: number;
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
  accountId: number;
  transactions: ExtractedTransaction[];
  skipIndices: number[];
  metadata?: ExtractedMetadata;
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
