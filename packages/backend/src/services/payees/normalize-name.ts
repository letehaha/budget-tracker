/**
 * Deterministic, locale-independent canonical form for a raw merchant string.
 * Used for indexed equality lookups against `Payees.normalizedName` and
 * `PayeeAliases.normalizedName`, and as the Fuse.js input text so fuzzy scores
 * aren't skewed by casing, punctuation, or diacritic noise.
 *
 * Pipeline:
 *   1. lowercase
 *   2. NFKD — split precomposed glyphs into base + combining marks
 *   3. strip combining marks (Combining Diacritical Marks block)
 *   4. collapse any non-letter / non-number / non-space to a single space
 *   5. collapse runs of whitespace to one space + trim
 */
export function normalizePayeeName({ raw }: { raw: string }): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
