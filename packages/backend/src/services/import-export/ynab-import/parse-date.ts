/**
 * Parse a YNAB Register.csv date cell into an ISO `YYYY-MM-DD` string.
 *
 * YNAB exports dates as US-style `MM/DD/YYYY` regardless of the user's
 * locale. Treating it as ambiguous (e.g. swapping for DD/MM/YYYY) would
 * silently shift every transaction in the European user's import.
 *
 * Returns null on any unparseable input.
 */
export function parseYnabDate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Verify by round-tripping through Date so we reject invalid combos like
  // 02/30/2026 — Date constructor would silently roll into March.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}
