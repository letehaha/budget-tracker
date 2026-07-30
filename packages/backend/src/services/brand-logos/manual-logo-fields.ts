import { EntityLogoPayload } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';

/** Columns to write. Absent key = leave the stored column untouched. */
interface ManualLogoPatch extends EntityLogoPayload {
  logoSource?: 'manual';
}

/** The entity's currently stored logo columns; an absent key means null
 *  (create paths, where nothing is stored yet). */
interface StoredLogoFields {
  logoDomain?: string | null;
  logoInitials?: string | null;
  logoColor?: string | null;
}

const LOGO_KEYS = ['logoDomain', 'logoInitials', 'logoColor'] as const;

/**
 * Turns the logo keys of a payee/subscription payload into the columns to write:
 * letters and a brand domain evict each other, and a key that changes a stored
 * value marks the logo user-owned (`logoSource: 'manual'`) so the resolver
 * leaves it alone. `stored` (empty on create) decides whether a color-only
 * payload has letters to paint behind, and whether the patch changes anything
 * at all: a patch whose writes all equal the stored values returns `{}` – a
 * no-op (e.g. clearing an already-empty field) must not claim ownership,
 * otherwise the background resolver could never fill that logo in later.
 */
export const resolveManualLogoFields = ({
  input,
  stored = {},
}: {
  input: EntityLogoPayload;
  stored?: StoredLogoFields;
}): ManualLogoPatch => {
  const { logoDomain, logoInitials, logoColor } = input;

  if (logoDomain === undefined && logoInitials === undefined && logoColor === undefined) {
    return {};
  }

  if (logoDomain != null && logoInitials != null) {
    throw new ValidationError({ message: t({ key: 'brandLogos.domainAndInitialsExclusive' }) });
  }

  const patch: ManualLogoPatch = { logoSource: 'manual' };

  if (logoInitials !== undefined) {
    patch.logoInitials = logoInitials;
    if (logoInitials !== null) {
      patch.logoDomain = null;
    } else {
      patch.logoColor = null;
    }
  }

  if (logoDomain !== undefined) {
    patch.logoDomain = logoDomain;
    if (logoDomain !== null) {
      patch.logoInitials = null;
      patch.logoColor = null;
    }
  }

  if (logoColor !== undefined) {
    const effectiveInitials = patch.logoInitials !== undefined ? patch.logoInitials : (stored.logoInitials ?? null);
    if (logoColor !== null && effectiveInitials === null) {
      throw new ValidationError({ message: t({ key: 'brandLogos.colorRequiresInitials' }) });
    }
    patch.logoColor = logoColor;
  }

  // Writing exactly the stored values changes nothing – stamping 'manual' then
  // would only lock the resolver out of a row the user didn't actually touch.
  const changesStoredValue = LOGO_KEYS.some((key) => key in patch && patch[key] !== (stored[key] ?? null));
  if (!changesStoredValue) {
    return {};
  }

  return patch;
};
