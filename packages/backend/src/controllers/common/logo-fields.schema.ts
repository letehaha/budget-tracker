import { t } from '@i18n/index';
import { z } from 'zod';

import { logoDomainSchema } from './logo-domain.schema';
import { logoColorSchema, logoInitialsSchema } from './logo-initials.schema';

/**
 * The logo keys of a write body, ready to spread into a `z.object`. Absent key =
 * leave the stored column untouched, explicit null = clear it.
 */
export const logoFieldsShape = {
  logoDomain: logoDomainSchema.optional(),
  logoInitials: logoInitialsSchema.optional(),
  logoColor: logoColorSchema.optional(),
};

interface LogoFieldsInput {
  logoDomain?: string | null;
  logoInitials?: string | null;
  logoColor?: string | null;
}

/**
 * Body-level `.superRefine` for any payload carrying `logoFieldsShape`: a brand
 * image and a monogram are two ways to fill the same slot, so a payload asking
 * for both is rejected instead of silently letting one win.
 */
export const refineLogoFields = ({ data, ctx }: { data: LogoFieldsInput; ctx: z.RefinementCtx }): void => {
  if (data.logoDomain != null && data.logoInitials != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: t({ key: 'brandLogos.domainAndInitialsExclusive' }),
      path: ['logoInitials'],
    });
  }
};

/**
 * `refineLogoFields` plus the create-only rule: a color paints the background of
 * a monogram, and a create has no stored initials to apply it to. Update bodies
 * are patches where a color alone recolors the stored monogram, so they keep
 * using `refineLogoFields`.
 */
export const refineLogoFieldsOnCreate = ({ data, ctx }: { data: LogoFieldsInput; ctx: z.RefinementCtx }): void => {
  refineLogoFields({ data, ctx });

  if (data.logoColor != null && data.logoInitials == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: t({ key: 'brandLogos.colorRequiresInitials' }),
      path: ['logoColor'],
    });
  }
};
