/**
 * Local CSV parsing for the investments-import column-mapping step.
 *
 * Papaparse is dynamically imported so the lib (≈50KB gzipped) is only fetched
 * when the user actually picks a CSV file — keeps the rest of the bundle lean.
 *
 * Worker mode is enabled so the parse runs off the main thread. The bank-import
 * flow used to make a backend round-trip for this; now everything happens
 * client-side and the previously server-imposed 50-row preview cap is gone.
 *
 * Output shape mirrors the (now-removed) backend `parse-csv` response so the
 * column-mapping step doesn't need to care whether parsing happened locally
 * or remotely.
 */
import { CSV_FORBIDDEN_HEADERS, MAX_CSV_ROWS } from '@bt/shared/types';

/** Frontend-only counterpart of the backend `parse-csv` response shape. */
export interface InvestmentImportParseCsvResult {
  headers: string[];
  preview: Record<string, string>[];
  detectedDelimiter: string;
  totalRows: number;
}

const FORBIDDEN_HEADERS = new Set<string>(CSV_FORBIDDEN_HEADERS);

export class CsvParseLocalError extends Error {
  constructor(
    message: string,
    public readonly code: 'EMPTY' | 'NO_HEADERS' | 'FORBIDDEN_HEADER' | 'TOO_MANY_ROWS' | 'PARSE_ERROR',
  ) {
    super(message);
    this.name = 'CsvParseLocalError';
  }
}

export async function parseCsvLocally({ fileText }: { fileText: string }): Promise<InvestmentImportParseCsvResult> {
  if (!fileText.trim()) {
    throw new CsvParseLocalError('CSV file is empty.', 'EMPTY');
  }

  const Papa = (await import('papaparse')).default;

  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(fileText, {
      worker: true,
      skipEmptyLines: true,
      complete: ({ data, meta, errors }) => {
        // Papaparse surfaces non-fatal warnings here too (e.g. quote mismatches
        // mid-file). Only fail on the first hard error — if rows came through
        // anyway, prefer letting the user see them in the preview and fix the
        // mapping later.
        if (data.length === 0 && errors.length > 0) {
          reject(new CsvParseLocalError(errors[0]?.message ?? 'CSV parse error', 'PARSE_ERROR'));
          return;
        }

        if (data.length === 0) {
          reject(new CsvParseLocalError('CSV file is empty.', 'EMPTY'));
          return;
        }

        const headers = (data[0] ?? []).map((h) => h.trim());
        if (headers.length === 0 || headers.every((h) => !h)) {
          reject(new CsvParseLocalError('CSV file has no header row.', 'NO_HEADERS'));
          return;
        }

        if (headers.some((h) => FORBIDDEN_HEADERS.has(h))) {
          reject(new CsvParseLocalError('CSV header uses a forbidden name (e.g. __proto__).', 'FORBIDDEN_HEADER'));
          return;
        }

        const dataRows = data.slice(1) as string[][];
        if (dataRows.length > MAX_CSV_ROWS) {
          reject(new CsvParseLocalError(`CSV exceeds the ${MAX_CSV_ROWS}-row limit.`, 'TOO_MANY_ROWS'));
          return;
        }

        const preview = dataRows.map((row) => {
          const obj: Record<string, string> = {};
          headers.forEach((header, idx) => {
            obj[header] = (row[idx] ?? '').trim();
          });
          return obj;
        });

        resolve({
          headers,
          preview,
          detectedDelimiter: meta.delimiter,
          totalRows: dataRows.length,
        });
      },
      error: (err: Error) => {
        reject(new CsvParseLocalError(err.message ?? 'CSV parse error', 'PARSE_ERROR'));
      },
    });
  });
}
