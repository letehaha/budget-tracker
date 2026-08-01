/** Storage caps the monogram at two graphemes. */
const MAX_MONOGRAM_GRAPHEMES = 2;

/**
 * Backend stores initials in VARCHAR(16) and validates length in code points,
 * so the client-side cap counts code points the same way.
 */
const MAX_MONOGRAM_CODE_POINTS = 16;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const toGraphemes = ({ value }: { value: string }): string[] =>
  [...graphemeSegmenter.segment(value)].map((part) => part.segment);

/**
 * Clamps a monogram to at most two graphemes and at most 16 code points.
 * Segmenting instead of slicing keeps emoji and ZWJ sequences intact rather
 * than cutting them mid-codepoint; when two graphemes together overflow the
 * code-point cap (e.g. two skin-toned family emoji), the second one is dropped
 * whole so the value stays storable.
 */
export const clampInitials = ({ value }: { value: string }): string => {
  const graphemes = toGraphemes({ value }).slice(0, MAX_MONOGRAM_GRAPHEMES);
  const clamped = graphemes.join('');
  if ([...clamped].length <= MAX_MONOGRAM_CODE_POINTS) return clamped;
  return graphemes[0] ?? '';
};

/**
 * "Local Bakery" → "LB", "Netflix" → "N". Takes the first grapheme of each
 * word so an emoji-leading name keeps the whole emoji. Uppercasing can expand
 * characters (ß → SS, ﬁ → FI), so the clamp runs last — the result can never
 * exceed what the backend accepts.
 */
export const deriveInitials = ({ name }: { name: string }): string => {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, MAX_MONOGRAM_GRAPHEMES)
    .map((word) => toGraphemes({ value: word })[0] ?? '')
    .join('')
    .toUpperCase();
  return clampInitials({ value: initials });
};
