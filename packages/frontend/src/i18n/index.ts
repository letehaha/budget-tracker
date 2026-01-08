import { type I18n, createI18n } from 'vue-i18n';

// Import default language (English) synchronously for initial load
import enMessages from './locales/en.json';

// Supported locales
const SUPPORTED_LOCALES = ['en', 'uk'] as const;
const DEFAULT_LOCALE: SupportedLocale = 'en';

// Type for supported locales
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// Type for message schema
type MessageSchema = typeof enMessages;

// Track which languages have been loaded
const loadedLanguages = new Set<string>([DEFAULT_LOCALE]);

// Create i18n instance with proper typing for multiple locales
export const i18n: I18n<{ en: MessageSchema; uk: MessageSchema }, {}, {}, SupportedLocale, false> = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    en: enMessages,
  },
  globalInjection: true,
  missingWarn: process.env.NODE_ENV === 'development',
  fallbackWarn: process.env.NODE_ENV === 'development',
});

/**
 * Lazy load a language's messages
 * @param locale - The locale to load (e.g., 'uk')
 */
export async function loadLanguageAsync(locale: string): Promise<void> {
  // If language already loaded, return
  if (loadedLanguages.has(locale)) {
    i18n.global.locale.value = locale as SupportedLocale;
    return;
  }

  // Validate locale
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    console.warn(`Locale "${locale}" is not supported. Falling back to "${DEFAULT_LOCALE}".`);
    return;
  }

  try {
    // Dynamically import the locale file
    const messages = await import(`./locales/${locale}.json`);

    // Set locale messages
    i18n.global.setLocaleMessage(locale as SupportedLocale, messages.default);

    // Mark as loaded
    loadedLanguages.add(locale);

    // Switch to the new locale
    i18n.global.locale.value = locale as SupportedLocale;
  } catch (error) {
    console.error(`Failed to load locale "${locale}":`, error);
  }
}

/**
 * Get current locale
 */
export function getCurrentLocale(): string {
  return i18n.global.locale.value;
}

/**
 * Set locale (will lazy load if needed)
 */
export async function setLocale(locale: string): Promise<void> {
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    console.warn(`Locale "${locale}" is not supported.`);
    return;
  }

  // Load language if not already loaded
  await loadLanguageAsync(locale);

  // Persist to localStorage
  localStorage.setItem('preferred-locale', locale);
}

/**
 * Initialize locale from various sources
 * Priority: localStorage → browser → default
 */
export function initializeLocale(): string {
  const storedLocale = localStorage.getItem('preferred-locale');
  const browserLocale = navigator.language.split('-')[0];

  const locale =
    (storedLocale && SUPPORTED_LOCALES.includes(storedLocale as SupportedLocale) ? storedLocale : null) ||
    (SUPPORTED_LOCALES.includes(browserLocale as SupportedLocale) ? browserLocale : null) ||
    DEFAULT_LOCALE;

  return locale;
}
