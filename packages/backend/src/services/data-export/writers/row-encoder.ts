import type { ColumnSpec } from '../registry';

/**
 * Project a transformer row to the ordered cell values its file's column
 * schema asks for. Arrays are joined with '; ' so a CSV/XLSX cell can carry
 * them – the JSON writer never goes through this path and keeps arrays as
 * arrays. `null` is preserved so XLSX consumers can distinguish "no value"
 * from "empty string" (csv-stringify already renders null as an empty cell);
 * `undefined` (a key the transformer never wrote) becomes ''.
 */
export function rowToValues({
  columns,
  row,
}: {
  columns: readonly ColumnSpec[];
  row: Record<string, unknown>;
}): unknown[] {
  return columns.map((column) => {
    const value = row[column.field];
    if (value === undefined) return '';
    if (column.kind === 'array') {
      return Array.isArray(value) ? value.join('; ') : (value ?? '');
    }
    return value;
  });
}
