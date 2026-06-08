import { totalRowCount } from '../transformers/utils';
import { EXPORT_SCHEMA_VERSION, type BuiltFile, type ExportTable } from '../types';
import type { ExportUserHeader, ExportWriter, ExportWriterInput } from './types';

const EMPTY_USER_HEADER: ExportUserHeader = { username: '', email: null, baseCurrency: '' };

/**
 * Render the whole export as a single hierarchical JSON document. Keys mirror
 * the CSV file names exactly so a consumer comfortable in JSON sees the same
 * mental model as one staring at a folder of CSVs.
 */
function writeJson({
  tables,
  exportedAt,
  user,
}: {
  tables: ExportTable[];
  exportedAt: Date;
  user: ExportUserHeader;
}): BuiltFile {
  const payload: Record<string, unknown> = {
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: exportedAt.toISOString(),
    user,
  };

  for (const table of tables) {
    payload[table.name] = table.rows;
  }

  return {
    filename: 'data-export.json',
    buffer: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    rowCount: totalRowCount({ tables }),
  };
}

export const jsonWriter: ExportWriter = {
  async write({ tables, exportedAt, user }: ExportWriterInput) {
    return [writeJson({ tables, exportedAt, user: user ?? EMPTY_USER_HEADER })];
  },
};
