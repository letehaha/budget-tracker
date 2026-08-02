import type { EntityLogoPayload } from '@bt/shared/types';

/**
 * What the logo picker hands back: either a brand domain resolved through
 * logo.dev, or a custom letter monogram with its background color.
 */
export type LogoSelection = { kind: 'brand'; domain: string } | { kind: 'monogram'; initials: string; color: string };

/** Default swatch of the Letters tab – the app's primary violet. */
export const DEFAULT_MONOGRAM_COLOR = '#7355be';

/**
 * Builds a selection from an entity's stored logo fields. Null means nothing
 * was set manually, so the backend auto-resolves. A monogram stored without a
 * color opens the picker on the default swatch.
 */
export const toLogoSelection = ({ logoDomain, logoInitials, logoColor }: EntityLogoPayload): LogoSelection | null => {
  if (logoInitials) return { kind: 'monogram', initials: logoInitials, color: logoColor ?? DEFAULT_MONOGRAM_COLOR };
  if (logoDomain) return { kind: 'brand', domain: logoDomain };
  return null;
};

/**
 * Maps a selection onto mutation fields. Null clears both the brand domain and
 * any monogram – clearing initials drops the stored color with them.
 */
export const toLogoPayload = ({ selection }: { selection: LogoSelection | null }): EntityLogoPayload => {
  if (!selection) return { logoDomain: null, logoInitials: null };
  if (selection.kind === 'brand') return { logoDomain: selection.domain };
  return { logoInitials: selection.initials, logoColor: selection.color };
};

/** Splits a selection into the props BrandLogo renders. */
export const toLogoDisplayProps = ({ selection }: { selection: LogoSelection | null }) => ({
  domain: selection?.kind === 'brand' ? selection.domain : null,
  initials: selection?.kind === 'monogram' ? selection.initials : null,
  color: selection?.kind === 'monogram' ? selection.color : null,
});
