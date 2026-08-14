// Tailwind's ~500-weight shades, chosen because that lightness step is the common
// heuristic for a hue that stays legible on both a near-white and a near-black surface.
export const CATEGORICAL_SERIES_PALETTE: string[] = [
  'rgb(139, 92, 246)', // violet
  'rgb(59, 130, 246)', // blue
  'rgb(16, 185, 129)', // emerald
  'rgb(245, 158, 11)', // amber
  'rgb(236, 72, 153)', // pink
  'rgb(20, 184, 166)', // teal
  'rgb(249, 115, 22)', // orange
  'rgb(168, 85, 247)', // purple
  'rgb(6, 182, 212)', // cyan
  'rgb(239, 68, 68)', // red
];

/** Muted slate for the folded tail of a series list, so "Others" never competes with a named series. */
export const OTHERS_SERIES_COLOR = 'rgb(148, 163, 184)';
