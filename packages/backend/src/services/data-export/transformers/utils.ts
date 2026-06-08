import { logger } from '@js/utils';
import { Op } from 'sequelize';

import type { ExportDateRange, ExportTable } from '../types';

/** Strip a Date or ISO string down to its YYYY-MM-DD prefix. */
export function toDateOnly({ value }: { value: Date | string }): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * Build a Sequelize WHERE fragment that constrains a date or timestamp column
 * to the requested closed interval. Returns `{}` when no range is given so
 * callers can spread the result unconditionally.
 *
 * Timestamp columns (e.g. `transactions.time`) need the upper bound expanded
 * to end-of-day so the inclusive interpretation of `to` covers everything
 * timestamped on that day. Pure DATE columns ignore the `T...` suffix and
 * compare on the calendar-day, so the same string works in both cases.
 */
export function buildDateRangeClause({
  field,
  dateRange,
}: {
  field: string;
  dateRange?: ExportDateRange;
}): Record<string, unknown> {
  if (!dateRange?.from && !dateRange?.to) return {};
  const op: Record<symbol, string> = {};
  if (dateRange.from) op[Op.gte] = `${dateRange.from}T00:00:00.000Z`;
  if (dateRange.to) op[Op.lte] = `${dateRange.to}T23:59:59.999Z`;
  return { [field]: op };
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
