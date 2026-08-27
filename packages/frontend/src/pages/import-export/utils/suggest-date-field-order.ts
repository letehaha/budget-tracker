/**
 * Client-side date-field-order suggestion + preview helpers for the Map step's
 * date-format expansion.
 *
 * The shape grammar lives in `@bt/shared/import-export/date-engine` — the same
 * module the server parses with — so the suggestion and preview shown in the
 * wizard match what the server will do cell-for-cell. The user always confirms
 * the order explicitly; these helpers only inform the UI (suggested badge, ISO
 * shortcut, live preview, mismatch count).
 */
import {
  detectAmbiguousDateSeparator,
  detectDateOrderSignals,
  isIntrinsicallyOrdered,
  parseImportDate,
} from '@bt/shared/import-export/date-engine';
import type { DateFieldOrder } from '@bt/shared/types';

interface DateFieldOrderSuggestion {
  /**
   * The order to pre-highlight as "Suggested". From a >12-field data signal
   * when one exists, otherwise the caller-provided locale fallback. Never
   * auto-committed — the user still has to pick.
   */
  suggestion: DateFieldOrder | null;
  /** True when no value disambiguates the order (every field ≤ 12), so the
   *  suggestion (if any) came from the locale fallback, not the data. */
  isAmbiguous: boolean;
  /** True when every non-empty cell is an intrinsically ordered shape (ISO
   *  date/datetime or compact YYYYMMDD) — the day/month pick is meaningless. */
  isIsoOnly: boolean;
  /** True when the column carries contradicting >12 signals (one row only
   *  valid day-first, another only valid month-first). */
  conflict: boolean;
}

/** Calendar-day components of a parsed date cell, for previews. */
interface DateCellParts {
  year: number;
  month: number;
  day: number;
}

/** Trimmed, non-empty cells — the only ones that carry any date information. */
function meaningfulValues({ values }: { values: string[] }): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

/**
 * Suggests a day/month order for a whole date column from its cell values.
 *
 * Only the ambiguous d/d/yyyy family carries order information: a lead field
 * above 12 can only be a day (→ day-first); a second field above 12 can only
 * be a month-position day (→ month-first). When no cell disambiguates, the
 * caller-provided `localeFallback` (typically the browser locale's convention)
 * informs the suggestion badge only.
 */
export function suggestDateFieldOrder({
  values,
  localeFallback,
}: {
  values: string[];
  localeFallback?: DateFieldOrder | null;
}): DateFieldOrderSuggestion {
  const cells = meaningfulValues({ values });

  const { sawDayFirst, sawMonthFirst } = detectDateOrderSignals({ values: cells });

  if (sawDayFirst && sawMonthFirst) {
    return { suggestion: null, isAmbiguous: false, isIsoOnly: false, conflict: true };
  }
  if (sawDayFirst) {
    return { suggestion: 'day-first', isAmbiguous: false, isIsoOnly: false, conflict: false };
  }
  if (sawMonthFirst) {
    return { suggestion: 'month-first', isAmbiguous: false, isIsoOnly: false, conflict: false };
  }

  // Shape-level check only: a malformed ISO cell (e.g. 2026-13-40) still counts
  // as "ISO shaped" here and surfaces later as a per-row invalid.
  const isIsoOnly = cells.length > 0 && cells.every((value) => isIntrinsicallyOrdered({ value }));
  if (isIsoOnly) {
    return { suggestion: null, isAmbiguous: false, isIsoOnly: true, conflict: false };
  }

  return { suggestion: localeFallback ?? null, isAmbiguous: true, isIsoOnly: false, conflict: false };
}

/**
 * The browser locale's conventional day/month order (e.g. `de-DE` → day-first,
 * `en-US` → month-first). Suggestion-badge input only — never a committed value.
 */
export function getBrowserLocaleFieldOrder(): DateFieldOrder {
  const parts = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(2000, 0, 15));
  const dayIndex = parts.findIndex((part) => part.type === 'day');
  const monthIndex = parts.findIndex((part) => part.type === 'month');
  if (dayIndex === -1 || monthIndex === -1) return 'month-first';
  return dayIndex < monthIndex ? 'day-first' : 'month-first';
}

/**
 * Parses one date cell into calendar-day parts under the given order —
 * `null` when the value matches no known shape or is impossible under it.
 * Zoned ISO datetimes report the UTC calendar day (preview precision only;
 * the backend stores the exact instant).
 */
export function parseDateCellParts({
  value,
  fieldOrder,
}: {
  value: string;
  fieldOrder: DateFieldOrder;
}): DateCellParts | null {
  const parsed = parseImportDate({ value, format: { fieldOrder } });
  if (!parsed) return null;
  if (parsed.kind === 'instant') {
    return {
      year: parsed.instant.getUTCFullYear(),
      month: parsed.instant.getUTCMonth() + 1,
      day: parsed.instant.getUTCDate(),
    };
  }
  return { year: parsed.year, month: parsed.month, day: parsed.day };
}

/** Number of non-empty cells that won't parse under `fieldOrder` — the wizard
 *  warns about them before the import turns them into invalid rows. */
export function countMismatchedDateCells({
  values,
  fieldOrder,
}: {
  values: string[];
  fieldOrder: DateFieldOrder;
}): number {
  return meaningfulValues({ values }).filter((value) => parseDateCellParts({ value, fieldOrder }) === null).length;
}

/**
 * Separator of the column's first ambiguous-family cell (`.`, `/` or `-`),
 * used to render option examples with the column's actual separator. `null`
 * when no ambiguous-family cell exists.
 */
export function detectDateSeparator({ values }: { values: string[] }): string | null {
  return detectAmbiguousDateSeparator({ values: meaningfulValues({ values }) });
}
