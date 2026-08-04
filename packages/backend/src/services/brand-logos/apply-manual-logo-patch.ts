import { EntityLogoPayload } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';

/** The entity's currently stored logo columns; an absent key means null
 *  (create paths, where nothing is stored yet). */
export interface StoredLogoFields {
  logoDomain?: string | null;
  logoInitials?: string | null;
  logoColor?: string | null;
}

/**
 * Turns the logo keys of a write payload into the columns to write: absent key
 * stays absent, a present key is written as given, and a brand domain and
 * monogram letters evict each other because they fill the same slot. `stored`
 * (empty on create) decides whether a color-only payload has letters to paint
 * behind.
 */
export const applyManualLogoPatch = ({
  patch,
  stored = {},
}: {
  patch: EntityLogoPayload;
  stored?: StoredLogoFields;
}): EntityLogoPayload => {
  const { logoDomain, logoInitials, logoColor } = patch;

  if (logoDomain === undefined && logoInitials === undefined && logoColor === undefined) {
    return {};
  }

  if (logoDomain != null && logoInitials != null) {
    throw new ValidationError({ message: t({ key: 'brandLogos.domainAndInitialsExclusive' }) });
  }

  const result: EntityLogoPayload = {};

  if (logoInitials !== undefined) {
    result.logoInitials = logoInitials;
    if (logoInitials !== null) {
      result.logoDomain = null;
    } else {
      result.logoColor = null;
    }
  }

  if (logoDomain !== undefined) {
    result.logoDomain = logoDomain;
    if (logoDomain !== null) {
      result.logoInitials = null;
      result.logoColor = null;
    }
  }

  if (logoColor !== undefined) {
    const effectiveInitials = result.logoInitials !== undefined ? result.logoInitials : (stored.logoInitials ?? null);
    if (logoColor !== null && effectiveInitials === null) {
      throw new ValidationError({ message: t({ key: 'brandLogos.colorRequiresInitials' }) });
    }
    result.logoColor = logoColor;
  }

  return result;
};
