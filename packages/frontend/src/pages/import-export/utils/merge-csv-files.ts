/**
 * Combines several CSV files the user selected into a single CSV string, so the
 * rest of the import pipeline (backend parse → map → resolve → detect → execute)
 * keeps working on one logical file and needs no multi-file awareness.
 *
 * Every file must share the same header row (same column names, same order).
 * Anything that would make the combined file ambiguous or unsafe — a mismatched
 * header, an unreadable file, an empty one, or a reserved header name — aborts
 * the whole batch with a {@link MergeCsvError} naming the offending file, rather
 * than silently dropping rows.
 *
 * Papaparse parses each file independently (auto-detecting its own delimiter),
 * then the rows are re-serialized into one canonical comma-delimited CSV. That
 * neutralizes per-file differences in delimiter, BOM, and line endings: the
 * backend re-detects a single delimiter over the combined output. Papaparse is
 * dynamically imported so the lib is only fetched when a merge actually runs.
 */
import { CSV_FORBIDDEN_HEADERS, MAX_CSV_ROWS } from '@bt/shared/types';

const FORBIDDEN_HEADERS = new Set<string>(CSV_FORBIDDEN_HEADERS);

export type MergeCsvErrorCode =
  /** No files were passed in. */
  | 'EMPTY_SELECTION'
  /** `file.text()` threw — the file could not be read. */
  | 'FILE_READ_FAILED'
  /** A file is blank or has no usable header row. */
  | 'FILE_EMPTY'
  /** A file has a header but zero data rows. */
  | 'FILE_NO_DATA_ROWS'
  /** A file's header differs from the first file's header. */
  | 'HEADER_MISMATCH'
  /** A header uses a reserved name (e.g. `__proto__`). */
  | 'FORBIDDEN_HEADER'
  /** The combined data rows exceed {@link MAX_CSV_ROWS}. */
  | 'TOO_MANY_ROWS'
  /** Papaparse reported a hard parse error with no recoverable rows. */
  | 'PARSE_ERROR';

/**
 * Thrown when files cannot be combined. `code` drives the user-facing message
 * (mapped to i18n by the caller); `fileName` names the offending file when one
 * is to blame. `meta` carries extra context for the message (e.g. the expected
 * vs. actual columns for a header mismatch, or the row limit).
 *
 * Has no top-level papaparse dependency, so callers can `import` it for an
 * `instanceof` check without pulling the parser into their chunk.
 */
export class MergeCsvError extends Error {
  constructor(
    message: string,
    public readonly code: MergeCsvErrorCode,
    public readonly fileName?: string,
    public readonly meta?: { expectedColumns?: string[]; actualColumns?: string[]; max?: number },
  ) {
    super(message);
    this.name = 'MergeCsvError';
  }
}

/** Per-file row count, in selection order, for UI display. */
export interface MergeCsvFileSummary {
  name: string;
  dataRowCount: number;
}

export interface MergeCsvResult {
  /** Combined CSV text: one header row followed by every file's data rows. */
  combinedContent: string;
  /** Column names from the first file (identical across all by contract). */
  headers: string[];
  /**
   * Every file's data rows (no header), in selection order, aligned to `headers`.
   * Lets the caller scan the full data set client-side — e.g. for transaction-type
   * coverage — without re-parsing the combined output.
   */
  dataRows: string[][];
  /** Per-file row counts, in selection order. */
  perFile: MergeCsvFileSummary[];
  /** Total data rows across all files. */
  totalDataRows: number;
}

/** Raw + trimmed view of one parsed file. `rawHeader` is shipped verbatim; `header` is trimmed for comparison. */
interface ParsedFile {
  rawHeader: string[];
  header: string[];
  dataRows: string[][];
}

/** Two headers match only when they have the same columns in the same order (case-sensitive, trimmed). */
function headersEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Combines `files` into a single CSV string. Rejects with a {@link MergeCsvError}
 * if the selection is empty, any file can't be read or parsed, or the headers
 * don't all match the first file's. Preserves selection order.
 *
 * `outputDelimiter` controls the delimiter of the re-serialized combined CSV
 * (default comma). Providers whose backend parser expects a fixed delimiter pass
 * theirs — BudgetBakers Wallet, for instance, parses with `;`, so feeding it
 * comma-joined output would collapse every row into a single column. Each input
 * file's own delimiter is still auto-detected by papaparse regardless.
 *
 * `maxRows` caps the combined data-row count (default {@link MAX_CSV_ROWS}); a
 * provider with a higher backend ceiling passes its own so the merge does not
 * reject imports the backend would accept.
 */
export async function mergeCsvFiles({
  files,
  outputDelimiter = ',',
  maxRows = MAX_CSV_ROWS,
}: {
  files: File[];
  outputDelimiter?: string;
  maxRows?: number;
}): Promise<MergeCsvResult> {
  if (files.length === 0) {
    throw new MergeCsvError('No files selected.', 'EMPTY_SELECTION');
  }

  const Papa = (await import('papaparse')).default;

  /** Parses one file's text into header + data rows, throwing on any structural problem. */
  const parseSingle = ({ text, name }: { text: string; name: string }): ParsedFile => {
    if (!text.trim()) {
      throw new MergeCsvError(`"${name}" is empty.`, 'FILE_EMPTY', name);
    }

    // Synchronous string parse (no worker): the merge runs once on a click behind a
    // spinner, so off-thread parsing isn't worth the Worker plumbing or the loss of
    // a plain return value the unit tests can assert on.
    const { data, errors } = Papa.parse<string[]>(text, { skipEmptyLines: true });

    if (data.length === 0) {
      // No rows came through. A hard parse error explains why; otherwise it's just empty.
      if (errors.length > 0) {
        throw new MergeCsvError(errors[0]?.message ?? `Could not parse "${name}".`, 'PARSE_ERROR', name);
      }
      throw new MergeCsvError(`"${name}" is empty.`, 'FILE_EMPTY', name);
    }

    const rawHeader = data[0] ?? [];
    const header = rawHeader.map((value) => value.trim());
    if (header.length === 0 || header.every((value) => !value)) {
      throw new MergeCsvError(`"${name}" has no header row.`, 'FILE_EMPTY', name);
    }

    if (header.some((value) => FORBIDDEN_HEADERS.has(value))) {
      throw new MergeCsvError(`"${name}" uses a reserved column name.`, 'FORBIDDEN_HEADER', name);
    }

    const dataRows = data.slice(1);
    if (dataRows.length === 0) {
      throw new MergeCsvError(`"${name}" has no data rows.`, 'FILE_NO_DATA_ROWS', name);
    }

    return { rawHeader, header, dataRows };
  };

  const parsed: ParsedFile[] = [];
  const perFile: MergeCsvFileSummary[] = [];

  for (const file of files) {
    let text: string;
    try {
      text = await file.text();
    } catch {
      throw new MergeCsvError(`Could not read "${file.name}".`, 'FILE_READ_FAILED', file.name);
    }

    const result = parseSingle({ text, name: file.name });

    // Every file must line up with the first; otherwise the single column-mapping
    // step would be meaningless across files with different columns.
    const reference = parsed[0];
    if (reference && !headersEqual(reference.header, result.header)) {
      throw new MergeCsvError(`Columns in "${file.name}" don't match the first file.`, 'HEADER_MISMATCH', file.name, {
        expectedColumns: reference.header,
        actualColumns: result.header,
      });
    }

    parsed.push(result);
    perFile.push({ name: file.name, dataRowCount: result.dataRows.length });
  }

  const totalDataRows = perFile.reduce((sum, file) => sum + file.dataRowCount, 0);
  if (totalDataRows > maxRows) {
    throw new MergeCsvError(`Selected files total more than ${maxRows} rows.`, 'TOO_MANY_ROWS', undefined, {
      max: maxRows,
    });
  }

  // First file's verbatim header + every file's data rows, re-serialized as one
  // canonical CSV using `outputDelimiter`. Papaparse quotes any field containing
  // the delimiter, a quote, or a newline, so the round-trip is delimiter-safe.
  const first = parsed[0]!;
  const dataRows: string[][] = parsed.flatMap((file) => file.dataRows);
  const combinedContent = Papa.unparse([first.rawHeader, ...dataRows], { delimiter: outputDelimiter });

  return {
    combinedContent,
    headers: first.header,
    dataRows,
    perFile,
    totalDataRows,
  };
}
