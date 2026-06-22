/**
 * Parse a Wallet (BudgetBakers) date cell into an ISO instant string.
 *
 * Wallet exports two date formats depending on export version:
 *  1. ISO-8601 datetime: `2025-12-25T11:00:00.000Z` or `2025-12-25T14:30:00`
 *     Strings that already carry a timezone designator (`Z` or `±hh:mm` offset)
 *     are parsed as-is. Bare strings with no timezone designator are treated as
 *     UTC (a trailing `Z` is appended before parsing) so the resulting instant
 *     does not depend on the server's local timezone — matching the deterministic
 *     UTC anchor used by Format 2.
 *  2. European locale format: `DD/MM/YYYY HH:MM`  (e.g. `25/12/2025 14:30`)
 *     Constructed as a UTC instant from the explicit fields via Date.UTC.
 *
 * Returning a normalized ISO instant (not a date-only string) preserves
 * sub-day precision used by the transfer-pairing algorithm, which groups legs
 * by exact timestamp match.
 *
 * Returns null on any unparseable input — caller skips the row with a warning.
 */
export function parseWalletDate({ raw }: { raw: string | null | undefined }): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  // --- Format 1: ISO-8601 instant (most common in recent Wallet exports) ---
  // Strings without a timezone designator are treated as UTC by appending `Z`
  // before parsing — prevents the server's local offset from shifting the instant.
  // Strings that already end with `Z` or a `±hh:mm` offset are passed through
  // unchanged so their explicit timezone is respected.
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const hour = Number(isoMatch[4]);
    const minute = Number(isoMatch[5]);
    const second = Number(isoMatch[6]);

    // V8's `Date.parse` silently rolls an out-of-range day forward in the
    // date-time form (`2025-02-30T..` → `2025-03-02`), which would misdate the
    // row rather than reject it. Validate the calendar fields as written before
    // trusting the parsed instant. Only the date portion is range-checked here —
    // a timezone designator shifts the resulting UTC instant, never the written
    // calendar date — so 30 Feb is invalid regardless of any offset.
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (hour > 23 || minute > 59 || second > 59) return null;
    const calCheck = new Date(Date.UTC(year, month - 1, day));
    if (calCheck.getUTCMonth() !== month - 1 || calCheck.getUTCDate() !== day) return null;

    const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed);
    const toParse = hasTimezone ? trimmed : `${trimmed}Z`;
    const ts = Date.parse(toParse);
    if (!Number.isFinite(ts)) return null;
    return new Date(ts).toISOString();
  }

  // --- Format 2: DD/MM/YYYY HH:MM (older Wallet exports) ---
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  // Round-trip through Date.UTC to reject invalid combos like 30 Feb.
  const ts = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const check = new Date(ts);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return check.toISOString();
}
