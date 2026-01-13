import { api } from '@/api/_api';
import type {
  ColumnMappingConfig,
  DetectDuplicatesRequest,
  DetectDuplicatesResponse,
  ExecuteImportRequest,
  ExecuteImportResponse,
  ExtractUniqueValuesResponse,
  StatementCostEstimate,
  StatementExtractionResult,
  StatementFileType,
} from '@bt/shared/types';

export interface ParseCsvRequest {
  fileContent: string;
  delimiter?: string;
}

export interface ParseCsvResponse {
  headers: string[];
  preview: Record<string, string>[];
  detectedDelimiter: string;
  totalRows: number;
}

export const parseCsv = async (payload: ParseCsvRequest): Promise<ParseCsvResponse> => {
  const result = await api.post('/import/csv/parse', payload);
  return result;
};

export interface ExtractUniqueValuesRequest {
  fileContent: string;
  delimiter: string;
  columnMapping: ColumnMappingConfig;
}

export const extractUniqueValues = async (
  payload: ExtractUniqueValuesRequest,
): Promise<ExtractUniqueValuesResponse> => {
  const result = await api.post('/import/csv/extract-unique-values', payload);
  return result;
};

export const detectDuplicates = async (payload: DetectDuplicatesRequest): Promise<DetectDuplicatesResponse> => {
  const result = await api.post('/import/csv/detect-duplicates', payload);
  return result;
};

export const executeImport = async (payload: ExecuteImportRequest): Promise<ExecuteImportResponse> => {
  const result = await api.post('/import/csv/execute', payload);
  return result;
};

// Statement Parser API (supports PDF, CSV, TXT)

export interface StatementCostEstimateRequest {
  fileBase64: string;
}

export interface StatementCostEstimateFailure {
  success: false;
  textExtraction: {
    success: false;
    characterCount: number;
    pageCount: number;
    error?: string;
  };
  fileType: StatementFileType;
  suggestion: string;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
}

export const estimateStatementCost = async (
  payload: StatementCostEstimateRequest,
): Promise<StatementCostEstimate | StatementCostEstimateFailure> => {
  const result = await api.post('/import/text-source/estimate-cost', payload);
  return result;
};

export interface StatementExtractRequest {
  fileBase64: string;
}

export const extractStatementTransactions = async (
  payload: StatementExtractRequest,
): Promise<StatementExtractionResult> => {
  const result = await api.post('/import/text-source/extract', payload);
  return result;
};

// Statement Parser - Duplicate Detection

export interface StatementDetectDuplicatesRequest {
  accountId: number;
  transactions: StatementExtractionResult['transactions'];
}

export interface StatementDetectDuplicatesResponse {
  duplicates: Array<{
    transactionIndex: number;
    extractedTransaction: StatementExtractionResult['transactions'][number];
    existingTransaction: {
      id: number;
      date: string;
      amount: number;
      note: string;
    };
  }>;
}

export const detectStatementDuplicates = async (
  payload: StatementDetectDuplicatesRequest,
): Promise<StatementDetectDuplicatesResponse> => {
  return api.post('/import/text-source/detect-duplicates', payload);
};

// Statement Parser - Execute Import

export interface StatementExecuteImportRequest {
  accountId: number;
  transactions: StatementExtractionResult['transactions'];
  skipIndices: number[];
}

export interface StatementExecuteImportResponse {
  summary: {
    imported: number;
    skipped: number;
    errors: Array<{
      transactionIndex: number;
      error: string;
    }>;
  };
  newTransactionIds: number[];
  batchId: string;
}

export const executeStatementImport = async (
  payload: StatementExecuteImportRequest,
): Promise<StatementExecuteImportResponse> => {
  return api.post('/import/text-source/execute', payload);
};
