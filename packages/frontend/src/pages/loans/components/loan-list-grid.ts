/**
 * Column template shared by the loans-list header row and every loan row so they stay aligned.
 * Applies only when the `loans-list` container is wide enough for the full table layout;
 * below that, rows fall back to their own stacked two-column grid and the header hides itself.
 *
 * Kept as a single static string so Tailwind's source scanner picks up the arbitrary classes.
 */
export const LOAN_LIST_GRID_COLS =
  'gap-x-4 @[56rem]/loans-list:grid-cols-[minmax(0,1.5fr)_minmax(0,1.25fr)_minmax(110px,auto)_minmax(48px,auto)_minmax(90px,auto)_minmax(84px,auto)_minmax(96px,auto)_14px]';
