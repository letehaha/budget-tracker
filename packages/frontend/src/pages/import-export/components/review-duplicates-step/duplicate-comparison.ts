import { formatShortDate } from '@/common/utils/date';
import type { DuplicateMatch } from '@bt/shared/types';

/** Shown in a comparison cell when that side has no value for the field. */
export const DUPLICATE_PLACEHOLDER = '—';

/** detect-duplicates returns amounts as integer cents; the UI always shows decimals. */
export const formatDuplicateAmount = (cents: number): string => (cents / 100).toFixed(2);

/**
 * Locale-aware date formatting for comparison cells. Delegates to formatShortDate,
 * which returns the raw input on invalid/empty values rather than throwing.
 */
export const formatDuplicateDate = (iso: string): string => formatShortDate(iso);

/** Fields compared between an imported CSV row and its matched existing transaction. */
export type ComparisonFieldKey = 'amount' | 'date' | 'note' | 'category';

/** One field compared across both sides; a `null` value means that side has nothing. */
export interface ComparisonRow {
  /** Stable field key — the caller maps it to a localized label. */
  key: ComparisonFieldKey;
  csv: string | null;
  existing: string | null;
  /** Amount — render monospace + medium weight. */
  emphasis?: boolean;
}

/**
 * Field-by-field comparison of a duplicate pair. Amount and date always show;
 * note and category only when at least one side has a value (existing
 * transactions carry no category, so that row is CSV-only). Returned in display
 * order; rows blank on both sides are dropped.
 */
export const buildComparisonRows = (item: DuplicateMatch): ComparisonRow[] => {
  const csv = item.importedTransaction;
  const existing = item.existingTransaction;
  const rows: ComparisonRow[] = [
    {
      key: 'amount',
      csv: formatDuplicateAmount(csv.amount),
      existing: formatDuplicateAmount(existing.amount),
      emphasis: true,
    },
    { key: 'date', csv: formatDuplicateDate(csv.date), existing: formatDuplicateDate(existing.date) },
    { key: 'note', csv: csv.description || null, existing: existing.note || null },
    { key: 'category', csv: csv.categoryName || null, existing: null },
  ];
  return rows.filter((row) => row.csv !== null || row.existing !== null);
};

/** Per-side field list (one side of the comparison) — drops fields absent on that side. */
export const sideComparisonFields = (item: DuplicateMatch, side: 'csv' | 'existing'): ComparisonRow[] =>
  buildComparisonRows(item).filter((row) => row[side] !== null);
