import { stringify } from 'csv-stringify/sync';

import { columnsFor } from '../registry';
import type { BuiltFile, ExportTable } from '../types';
import { rowToValues } from './row-encoder';
import type { ExportWriter, ExportWriterInput } from './types';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Produce one CSV per ExportTable. Files are prefixed with a UTF-8 BOM so
 * Excel renders unicode account/category names correctly without forcing the
 * user to use "Import Text" with explicit encoding.
 */
function writeCsvFiles({ tables }: { tables: ExportTable[] }): BuiltFile[] {
  return tables.map((table) => {
    const columns = columnsFor({ name: table.name });
    const records = (table.rows as unknown as Record<string, unknown>[]).map((row) => rowToValues({ columns, row }));
    const body = stringify(records, {
      header: true,
      columns: columns.map((c) => c.header),
    });
    return {
      filename: `${table.name}.csv`,
      buffer: Buffer.concat([BOM, Buffer.from(body, 'utf8')]),
      rowCount: table.rows.length,
    };
  });
}

export const csvWriter: ExportWriter = {
  async write({ tables }: ExportWriterInput) {
    return writeCsvFiles({ tables });
  },
};
