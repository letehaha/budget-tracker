import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { CsvError, parse } from 'csv-parse/sync';

// Shared csv-parse options for every record parse in the CSV import feature.
// `relaxQuotes` keeps a stray quote in an unquoted field as a literal character
// rather than a fatal error, while still honouring quote-at-field-start for
// legitimate quoted fields (embedded delimiters, doubled-quote escapes).
const CSV_PARSE_OPTIONS = {
  skipEmptyLines: true,
  relaxColumnCount: true,
  relaxQuotes: true,
  trim: true,
  columns: false,
} as const;

/**
 * Parse CSV content into raw string rows. A malformed file (unbalanced quotes,
 * a delimiter that leaves the row unparseable) is user-fixable input, so a
 * csv-parse failure is surfaced as a ValidationError (422) instead of escaping
 * as an unhandled 500. Non-parser errors propagate untouched.
 */
export function parseCsvRecords({ fileContent, delimiter }: { fileContent: string; delimiter: string }): string[][] {
  try {
    return parse(fileContent, { ...CSV_PARSE_OPTIONS, delimiter }) as string[][];
  } catch (error) {
    if (error instanceof CsvError) {
      throw new ValidationError({ message: t({ key: 'csvImport.csvFileMalformed' }) });
    }
    throw error;
  }
}
