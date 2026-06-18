/**
 * Palette assigned to accounts/categories/tags that an import creates fresh.
 * A new record gets a colour picked uniformly at random from these eight.
 */
const RANDOM_COLOR_PALETTE = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
] as const;

/** Pick one colour from the import palette uniformly at random. */
export function pickRandomColor(): string {
  return RANDOM_COLOR_PALETTE[Math.floor(Math.random() * RANDOM_COLOR_PALETTE.length)]!;
}
