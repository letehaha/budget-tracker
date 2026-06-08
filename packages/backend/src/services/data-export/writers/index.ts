import type { ExportFormat } from '../types';
import { csvWriter } from './csv-writer';
import { jsonWriter } from './json-writer';
import type { ExportWriter } from './types';
import { xlsxWriter } from './xlsx-writer';

/**
 * Format → writer dispatch table. Adding a new output format means writing one
 * `ExportWriter` and adding its key here – the service orchestrator does not
 * need a per-format branch.
 */
export const WRITERS: Record<ExportFormat, ExportWriter> = {
  json: jsonWriter,
  csv: csvWriter,
  xlsx: xlsxWriter,
};
