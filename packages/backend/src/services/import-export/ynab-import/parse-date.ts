import { type DateFieldOrder } from '@bt/shared/types';
import { parseImportDate } from '@services/import-export/core/parse/date-engine';

/** Year-last date with two 1-2 digit lead fields — the only shape whose
 *  day/month order is not intrinsic. Mirrors the date engine's family. */
const AMBIGUOUS_FIELD_ORDER_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/**
 * Parse a YNAB Register.csv date cell into an ISO `YYYY-MM-DD` string.
 *
 * YNAB writes dates in the budget's Date Format setting — MM/DD/YYYY,
 * DD/MM/YYYY, YYYY-MM-DD, DD.MM.YYYY and friends all occur. `fieldOrder` is
 * resolved once for the whole column so a d/d/yyyy file never flips reading
 * mid-import.
 *
 * Returns null on any unparseable input.
 */
export function parseYnabDate({
  raw,
  fieldOrder,
}: {
  raw: string | null | undefined;
  fieldOrder: DateFieldOrder;
}): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const parsed = parseImportDate({ value: trimmed, format: { fieldOrder } });
  if (!parsed) return null;

  const { year, month, day } =
    parsed.kind === 'instant'
      ? {
          year: parsed.instant.getUTCFullYear(),
          month: parsed.instant.getUTCMonth() + 1,
          day: parsed.instant.getUTCDate(),
        }
      : parsed;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * True when the column contains d/d/yyyy values and not one of them settles the
 * day/month order — the case where the parser has to fall back to a convention
 * and should say so.
 */
export function hasAmbiguousDateFieldOrder({ values }: { values: string[] }): boolean {
  let sawAmbiguousFamily = false;

  for (const value of values) {
    const match = value.trim().match(AMBIGUOUS_FIELD_ORDER_RE);
    if (!match) continue;
    if (Number(match[1]) > 12 || Number(match[2]) > 12) return false;
    sawAmbiguousFamily = true;
  }

  return sawAmbiguousFamily;
}
