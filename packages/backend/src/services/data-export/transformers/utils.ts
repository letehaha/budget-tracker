import { logger } from '@js/utils';

import type { ExportTable } from '../types';

/** Strip a Date or ISO string down to its YYYY-MM-DD prefix. */
export function toDateOnly({ value }: { value: Date | string }): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Combined row count across every table in a built export. Shared by the
 *  service (size-limit gate) and the writers (manifest `rowCount` entries). */
export function totalRowCount({ tables }: { tables: ExportTable[] }): number {
  return tables.reduce((sum, t) => sum + t.rows.length, 0);
}

/**
 * Warn (once per export run, per relation) when a foreign key cannot be
 * resolved to its target row. Dangling FKs in transformers silently produce
 * empty cells, which masks data-integrity issues from the user reading the
 * export.
 *
 * Returns the resolved name or – if the FK is missing – the sentinel
 * `(unresolved <relation>)` so the human reader sees the gap rather than a
 * blank that reads as "no value".
 */
export function resolveRelationName({
  id,
  nameById,
  relation,
  context,
}: {
  id: string | null | undefined;
  nameById: Map<string, string>;
  relation: string;
  context: string;
}): string {
  if (!id) return '';
  const name = nameById.get(id);
  if (name !== undefined) return name;
  logger.warn(
    `Data export: ${relation} reference ${id} could not be resolved (context=${context}); emitting unresolved sentinel.`,
  );
  return `(unresolved ${relation})`;
}
