import { t } from '@i18n/index';
import { z } from 'zod';

// Code-point cap matching the VARCHAR(16) columns – Postgres counts code
// points, not UTF-16 units (a ZWJ emoji spans several units per code point,
// so `.max()` on the string would reject values the column accepts). A single
// grapheme can span many code points, so grapheme count is a separate check.
const MAX_CODE_POINTS = 16;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const countGraphemes = ({ value }: { value: string }): number => [...graphemeSegmenter.segment(value)].length;

// Monogram letters shown instead of a brand image. 1-2 graphemes so the result
// stays legible at avatar sizes; null is valid – the user is clearing them.
export const logoInitialsSchema = z
  .string()
  .trim()
  .refine((value) => [...value].length <= MAX_CODE_POINTS, `logoInitials must be at most ${MAX_CODE_POINTS} characters`)
  .refine((value) => {
    const graphemes = countGraphemes({ value });
    return graphemes >= 1 && graphemes <= 2;
  }, 'logoInitials must be 1 or 2 characters')
  .nullable();

// Monogram background, normalized to lowercase so stored values compare directly
// against the frontend's preset swatches. null is valid – falls back to the
// default primary tint.
export const logoColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'logoColor must be a #rrggbb hex color')
  .transform((value) => value.toLowerCase())
  .nullable();

/**
 * A brand image and a monogram are two ways to fill the same slot, so a payload
 * asking for both is rejected instead of silently letting one win. Meant for a
 * body-level `.superRefine`.
 */
export const refineLogoSelection = ({
  data,
  ctx,
}: {
  data: { logoDomain?: string | null; logoInitials?: string | null };
  ctx: z.RefinementCtx;
}): void => {
  if (data.logoDomain != null && data.logoInitials != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: t({ key: 'brandLogos.domainAndInitialsExclusive' }),
      path: ['logoInitials'],
    });
  }
};
