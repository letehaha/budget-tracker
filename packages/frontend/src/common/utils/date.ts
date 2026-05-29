/**
 * Format an ISO date string for compact UI display (e.g. "29 May 2026").
 * Falls back to the raw input if the value can't be parsed, so callers can
 * pass user-entered or partially-populated values without crashing.
 */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
