/**
 * Single home for the loan "calendar day" definition. The canonical filter is
 * the SQL `DATE("time") >= anchorDate` in `getPostAnchorPaymentLegs`, which a
 * UTC database evaluates as the UTC calendar day — so every JS-side day
 * classification must use the UTC day too, never the server-local day, or the
 * SQL filter and the in-process grouping/guards would disagree for timestamps
 * near midnight on non-UTC servers.
 */

/** UTC calendar day of `date` as `yyyy-MM-dd` — exactly what SQL `DATE("time")` yields in a UTC database. */
export const utcDayKey = ({ date }: { date: Date | string }): string => new Date(date).toISOString().slice(0, 10);

/**
 * Whether `time` falls on or after the loan's balance anchor day (inclusive
 * boundary — the anchor snapshot is the outstanding *before* that day's
 * payments, so same-day legs still count).
 */
export const isOnOrAfterAnchorDay = ({
  time,
  anchorDate,
}: {
  time: Date | string;
  /** yyyy-MM-dd inclusive boundary. */
  anchorDate: string;
}): boolean => utcDayKey({ date: time }) >= anchorDate;
