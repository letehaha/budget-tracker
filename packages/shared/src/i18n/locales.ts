/**
 * Shared i18n constants between frontend and backend
 */

export const SUPPORTED_LOCALES = {
  ENGLISH: 'en',
  UKRAINIAN: 'uk',
} as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[keyof typeof SUPPORTED_LOCALES];

export const DEFAULT_LOCALE: SupportedLocale = SUPPORTED_LOCALES.ENGLISH;

export const LOCALE_NAMES: Record<SupportedLocale, { native: string; english: string }> = {
  [SUPPORTED_LOCALES.ENGLISH]: {
    native: 'English',
    english: 'English',
  },
  [SUPPORTED_LOCALES.UKRAINIAN]: {
    native: 'Українська',
    english: 'Ukrainian',
  },
};

/**
 * Check if a locale is supported
 */
export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return Object.values(SUPPORTED_LOCALES).includes(locale as SupportedLocale);
}

/**
 * Get a valid locale, falling back to default if invalid
 */
export function getValidLocale(locale: string | undefined | null): SupportedLocale {
  if (locale && isSupportedLocale(locale)) {
    return locale;
  }
  return DEFAULT_LOCALE;
}
