import { ValidationError } from '@js/errors';
import { parse } from 'csv-parse/sync';

interface CSVParseResult {
  headers: string[];
  preview: Record<string, string>[];
  detectedDelimiter: string;
  totalRows: number;
}

/**
 * Detects the most likely CSV delimiter by testing common delimiters
 * Returns the delimiter that produces the most consistent column count
 */
export function detectDelimiter(sample: string): string {
  const delimiters = [',', ';', '\t', '|'];
  const lines = sample.split('\n').slice(0, 10); // Check first 10 lines

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
    throw new ValidationError({ message: 'CSV file is empty' });
  }

  // First row is headers
  const headers = records[0];

  // Validate headers
  if (!headers || headers.length === 0) {
    throw new ValidationError({ message: 'CSV file has no headers' });
  }

  // Convert data rows to objects
  const dataRows = records.slice(1);
  const totalRows = dataRows.length;

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
