/**
 * Returns the calendar-day portion of an ISO instant string (YYYY-MM-DD).
 * Duplicate matching is day-granular, so all date keys use this helper to
 * ensure consistent truncation across the fetch-window bounds, the existing-
 * transaction index, and the incoming row key.
 */
export function importDayKey({ iso }: { iso: string }): string {
  return iso.split('T')[0]!;
}
