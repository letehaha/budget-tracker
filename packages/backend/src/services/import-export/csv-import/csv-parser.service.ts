import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { parse } from 'csv-parse/sync';

interface CSVParseResult {
  headers: string[];
  preview: Record<string, string>[];
  detectedDelimiter: string;
  totalRows: number;
}

export const MAX_CSV_ROWS = 50_000;
const DELIMITER_DETECTION_SAMPLE_BYTES = 16 * 1024;
const FORBIDDEN_HEADER_NAMES = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Detects the most likely CSV delimiter by testing common delimiters
 * Returns the delimiter that produces the most consistent column count
 */
function detectDelimiter(sample: string): string {
  const delimiters = [',', ';', '\t', '|'];
  // Cap the sample BEFORE split('\n') so we don't allocate a huge array on
  // 10MB inputs — only the first ~16KB is needed to recognise a delimiter.
  const cappedSample =
    sample.length > DELIMITER_DETECTION_SAMPLE_BYTES ? sample.slice(0, DELIMITER_DETECTION_SAMPLE_BYTES) : sample;
  const lines = cappedSample.split('\n').slice(0, 10); // Check first 10 lines

  let bestDelimiter = ',';
  let maxScore = 0;

  for (const delimiter of delimiters) {
    try {
      const records = parse(lines.join('\n'), {
        delimiter,
        relaxColumnCount: false,
        skipEmptyLines: true,
      });

      if (records.length < 2) continue;

      // Score based on consistency of column count
      const columnCounts = records.map((row: string[]) => row.length);
      const avgColumns = columnCounts.reduce((a: number, b: number) => a + b, 0) / columnCounts.length;
      const consistency = columnCounts.filter((c: number) => c === avgColumns).length / columnCounts.length;

      // Prefer delimiters with more columns and higher consistency
      const score = avgColumns * consistency;

      if (score > maxScore && avgColumns > 1) {
        maxScore = score;
        bestDelimiter = delimiter;
      }
    } catch {
      // Skip this delimiter if parsing fails
      continue;
    }
  }

  return bestDelimiter;
}

/**
 * Parses CSV file content and returns headers, preview rows, and metadata
 * @param fileContent - Full CSV file content as string
 * @param delimiter - Optional delimiter (will auto-detect if not provided)
 * @param previewLimit - Number of rows to return in preview (default 50)
 */
export function parseCSV({
  fileContent,
  delimiter,
  previewLimit = 50,
}: {
  fileContent: string;
  delimiter?: string;
  previewLimit: number;
}): CSVParseResult {
  // Auto-detect delimiter if not provided
  const detectedDelimiter = delimiter || detectDelimiter(fileContent);

  // Parse the CSV
  const records = parse(fileContent, {
    delimiter: detectedDelimiter,
    skipEmptyLines: true,
    relaxColumnCount: true, // Allow rows with different column counts
    trim: true,
    columns: false, // Don't use first row as headers yet
  }) as string[][];

  if (records.length === 0) {
    throw new ValidationError({ message: t({ key: 'csvImport.csvFileEmpty' }) });
  }

  // First row is headers
  const headers = records[0];

  // Validate headers
  if (!headers || headers.length === 0) {
    throw new ValidationError({ message: t({ key: 'csvImport.csvFileNoHeaders' }) });
  }

  // Reject prototype-pollution-shaped header names. We index a plain object
  // by header below; an attacker-supplied `__proto__` / `constructor` header
  // would mutate the prototype chain or shadow built-ins.
  if (headers.some((h) => FORBIDDEN_HEADER_NAMES.has(h))) {
    throw new ValidationError({ message: t({ key: 'csvImport.csvFileForbiddenHeader' }) });
  }

  // Convert data rows to objects
  const dataRows = records.slice(1);
  const totalRows = dataRows.length;

  // Cap row count to bound downstream work (mapping, duplicate detection).
  if (totalRows > MAX_CSV_ROWS) {
    throw new ValidationError({
      message: t({ key: 'csvImport.csvFileTooManyRows', variables: { max: MAX_CSV_ROWS } }),
    });
  }

  // Get preview rows (first N rows)
  const previewRows = dataRows.slice(0, previewLimit);

  const preview: Record<string, string>[] = previewRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  });

  return {
    headers,
    preview,
    detectedDelimiter,
    totalRows,
  };
}
