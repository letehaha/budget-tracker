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

/**
 * Maps a selection onto mutation fields, contributing no keys when nothing was
 * picked. Present-null keys stamp logoSource 'manual', so an untouched picker
 * has to stay out of the payload entirely rather than send explicit nulls.
 */
export const toOptionalLogoPayload = ({
  selection,
}: {
  selection: LogoSelection | null | undefined;
}): EntityLogoPayload => (selection ? toLogoPayload({ selection }) : {});

/**
 * Structural identity of a selection. Refetches rebuild the entity object, so
 * comparing selections by reference would report spurious changes.
 */
export const logoSelectionKey = ({ selection }: { selection: LogoSelection | null }): string => {
  if (!selection) return 'none';
  return selection.kind === 'brand' ? `brand:${selection.domain}` : `monogram:${selection.initials}:${selection.color}`;
};

/** Splits a selection into the props BrandLogo renders. */
export const toLogoDisplayProps = ({ selection }: { selection: LogoSelection | null }) => ({
  domain: selection?.kind === 'brand' ? selection.domain : null,
  initials: selection?.kind === 'monogram' ? selection.initials : null,
  color: selection?.kind === 'monogram' ? selection.color : null,
});
