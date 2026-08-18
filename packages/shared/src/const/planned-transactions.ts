/**
 * A bank transaction merges into a planned one only when their dates are at most
 * this many days apart. The frontend uses it to flag plans whose window has passed.
 */
export const PLANNED_MATCH_WINDOW_DAYS = 7;
