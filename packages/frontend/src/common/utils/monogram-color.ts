/** App's near-black foreground – readable on bright fills where white washes out. */
const DARK_TEXT = '#201c16';
const LIGHT_TEXT = '#ffffff';

/** Fills brighter than this get dark letters, everything else white. */
const BRIGHT_FILL_THRESHOLD = 0.55;

const HEX_COLOR = /^#?([0-9a-f]{6})$/i;

/**
 * Letter color for a monogram drawn on a solid `#rrggbb` background, so an
 * arbitrary user-picked color stays legible. Unparseable input falls back to
 * white, matching the default primary-tint monogram.
 */
export const getMonogramTextColor = ({ hex }: { hex: string }): string => {
  const match = HEX_COLOR.exec(hex.trim());
  if (!match) return LIGHT_TEXT;

  const value = parseInt(match[1]!, 16);
  const red = ((value >> 16) & 0xff) / 255;
  const green = ((value >> 8) & 0xff) / 255;
  const blue = (value & 0xff) / 255;

  // Rec. 709 weights: green carries most of what the eye reads as brightness.
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

  return luminance > BRIGHT_FILL_THRESHOLD ? DARK_TEXT : LIGHT_TEXT;
};
