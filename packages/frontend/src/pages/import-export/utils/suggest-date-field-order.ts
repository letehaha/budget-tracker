/**
 * Client-side date-field-order suggestion + preview helpers for the Map step's
 * date-format expansion.
 *
 * The shape grammar and the >12-field signal detection mirror the backend's
 * `date-engine` (packages/backend .../core/parse/date-engine.ts), so the
 * suggestion and preview shown in the wizard match what the server will parse.
 * The user always confirms the order explicitly — these helpers only inform
 * the UI (suggested badge, ISO shortcut, live preview, mismatch count).
 */
import type { DateFieldOrder } from '@bt/shared/types';

// ISO datetime carrying an explicit zone (`Z` or `±hh:mm`) — an absolute moment.
const ISO_ZONED_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

// ISO datetime WITHOUT a zone (T- or space-separated, optional seconds/ms).
const ISO_LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;

// Year-first date with `-`, `/` or `.` separators (YYYY-MM-DD and variants).
const ISO_DATE = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/;

// Compact 8-digit YYYYMMDD with no separators.
const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/;

// Year-LAST date with two 1-2 digit lead fields (d/d/yyyy, `/ . -` separators).
// Which lead field is the day vs the month is intrinsically ambiguous — the
// user's confirmed `DateFieldOrder` resolves it.
const AMBIGUOUS_DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

// First separator character of an ambiguous-family value, for option labels.
const AMBIGUOUS_SEPARATOR = /^\d{1,2}([/.-])/;

export interface DateFieldOrderSuggestion {
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
export interface DateCellParts {
  year: number;
  month: number;
  day: number;
}

function isValidCalendarDate({ year, month, day }: DateCellParts): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // `new Date(year, month, 0)` is the last day of `month`, so this rejects
  // overlong days (e.g. Feb 30) instead of letting them roll into next month.
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

/** Trimmed, non-empty cells — the only ones that carry any date information. */
function meaningfulValues({ values }: { values: string[] }): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function isIntrinsicallyOrdered({ value }: { value: string }): boolean {
  return (
    ISO_ZONED_DATETIME.test(value) || ISO_LOCAL_DATETIME.test(value) || ISO_DATE.test(value) || COMPACT_DATE.test(value)
  );
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

  let sawDayFirstSignal = false;
  let sawMonthFirstSignal = false;

  for (const value of cells) {
    const match = value.match(AMBIGUOUS_DMY);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12) sawDayFirstSignal = true;
    if (second > 12) sawMonthFirstSignal = true;
  }

  if (sawDayFirstSignal && sawMonthFirstSignal) {
    return { suggestion: null, isAmbiguous: false, isIsoOnly: false, conflict: true };
  }
  if (sawDayFirstSignal) {
    return { suggestion: 'day-first', isAmbiguous: false, isIsoOnly: false, conflict: false };
  }
  if (sawMonthFirstSignal) {
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
  if (ISO_ZONED_DATETIME.test(value)) {
    const instant = new Date(value);
    return { year: instant.getUTCFullYear(), month: instant.getUTCMonth() + 1, day: instant.getUTCDate() };
  }

  const localMatch = value.match(ISO_LOCAL_DATETIME);
  if (localMatch) {
    return { year: Number(localMatch[1]), month: Number(localMatch[2]), day: Number(localMatch[3]) };
  }

  const isoMatch = value.match(ISO_DATE) ?? value.match(COMPACT_DATE);
  if (isoMatch) {
    const parts = { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) };
    return isValidCalendarDate(parts) ? parts : null;
  }

  const ambiguousMatch = value.match(AMBIGUOUS_DMY);
  if (ambiguousMatch) {
    const first = Number(ambiguousMatch[1]);
    const second = Number(ambiguousMatch[2]);
    const parts = {
      year: Number(ambiguousMatch[3]),
      month: fieldOrder === 'day-first' ? second : first,
      day: fieldOrder === 'day-first' ? first : second,
    };
    return isValidCalendarDate(parts) ? parts : null;
  }

  return null;
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
  for (const value of meaningfulValues({ values })) {
    if (!AMBIGUOUS_DMY.test(value)) continue;
    const match = value.match(AMBIGUOUS_SEPARATOR);
    if (match?.[1]) return match[1];
  }
  return null;
}
