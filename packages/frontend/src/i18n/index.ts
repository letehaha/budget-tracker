import { type I18n, createI18n } from 'vue-i18n';
import type { RouteLocationNormalized } from 'vue-router';

// Import common chunk synchronously for initial load (en only)
import enCommon from './locales/chunks/en/common.json';
import type { ChunkRegistry, I18nChunkName, LoadedChunksMap } from './types';

// Supported locales
const SUPPORTED_LOCALES = ['en', 'uk'] as const;
const DEFAULT_LOCALE: SupportedLocale = 'en';

// Type for supported locales
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// Track which chunks have been loaded per locale
const loadedChunks: LoadedChunksMap = new Map([['en', new Set<I18nChunkName>(['common'])]]);

// Chunk registry - maps locale + chunk name to dynamic import
const chunkRegistry: ChunkRegistry = {
  en: {
    // Core chunks
    common: () => import('./locales/chunks/en/common.json'),
    layout: () => import('./locales/chunks/en/layout.json'),
    dialogs: () => import('./locales/chunks/en/dialogs.json'),
    forms: () => import('./locales/chunks/en/forms.json'),
    errors: () => import('./locales/chunks/en/errors.json'),
    // Auth chunks
    'auth/sign-in': () => import('./locales/chunks/en/auth/sign-in.json'),
    'auth/sign-up': () => import('./locales/chunks/en/auth/sign-up.json'),
    'auth/verify-email': () => import('./locales/chunks/en/auth/verify-email.json'),
    'auth/welcome': () => import('./locales/chunks/en/auth/welcome.json'),
    // Page chunks
    'pages/dashboard': () => import('./locales/chunks/en/pages/dashboard.json'),
    'pages/accounts': () => import('./locales/chunks/en/pages/accounts.json'),
    'pages/account': () => import('./locales/chunks/en/pages/account.json'),
    'pages/account-integrations': () => import('./locales/chunks/en/pages/account-integrations.json'),
    'pages/transactions': () => import('./locales/chunks/en/pages/transactions.json'),
    'pages/budgets': () => import('./locales/chunks/en/pages/budgets.json'),
    'pages/budget-details': () => import('./locales/chunks/en/pages/budget-details.json'),
    'pages/analytics': () => import('./locales/chunks/en/pages/analytics.json'),
    'pages/investments': () => import('./locales/chunks/en/pages/investments.json'),
    'pages/portfolio-detail': () => import('./locales/chunks/en/pages/portfolio-detail.json'),
    'pages/crypto': () => import('./locales/chunks/en/pages/crypto.json'),
    'pages/import-csv': () => import('./locales/chunks/en/pages/import-csv.json'),
    'pages/import-statement': () => import('./locales/chunks/en/pages/import-statement.json'),
    // Settings chunks
    'settings/index': () => import('./locales/chunks/en/settings/index.json'),
    'settings/categories': () => import('./locales/chunks/en/settings/categories.json'),
    'settings/tags': () => import('./locales/chunks/en/settings/tags.json'),
    'settings/currencies': () => import('./locales/chunks/en/settings/currencies.json'),
    'settings/accounts-groups': () => import('./locales/chunks/en/settings/accounts-groups.json'),
    'settings/data-management': () => import('./locales/chunks/en/settings/data-management.json'),
    'settings/preferences': () => import('./locales/chunks/en/settings/preferences.json'),
    'settings/ai': () => import('./locales/chunks/en/settings/ai.json'),
    'settings/security': () => import('./locales/chunks/en/settings/security.json'),
    'settings/admin': () => import('./locales/chunks/en/settings/admin.json'),
  },
  uk: {
    // Core chunks
    common: () => import('./locales/chunks/uk/common.json'),
    layout: () => import('./locales/chunks/uk/layout.json'),
    dialogs: () => import('./locales/chunks/uk/dialogs.json'),
    forms: () => import('./locales/chunks/uk/forms.json'),
    errors: () => import('./locales/chunks/uk/errors.json'),
    // Auth chunks
    'auth/sign-in': () => import('./locales/chunks/uk/auth/sign-in.json'),
    'auth/sign-up': () => import('./locales/chunks/uk/auth/sign-up.json'),
    'auth/verify-email': () => import('./locales/chunks/uk/auth/verify-email.json'),
    'auth/welcome': () => import('./locales/chunks/uk/auth/welcome.json'),
    // Page chunks
    'pages/dashboard': () => import('./locales/chunks/uk/pages/dashboard.json'),
    'pages/accounts': () => import('./locales/chunks/uk/pages/accounts.json'),
    'pages/account': () => import('./locales/chunks/uk/pages/account.json'),
    'pages/account-integrations': () => import('./locales/chunks/uk/pages/account-integrations.json'),
    'pages/transactions': () => import('./locales/chunks/uk/pages/transactions.json'),
    'pages/budgets': () => import('./locales/chunks/uk/pages/budgets.json'),
    'pages/budget-details': () => import('./locales/chunks/uk/pages/budget-details.json'),
    'pages/analytics': () => import('./locales/chunks/uk/pages/analytics.json'),
    'pages/investments': () => import('./locales/chunks/uk/pages/investments.json'),
    'pages/portfolio-detail': () => import('./locales/chunks/uk/pages/portfolio-detail.json'),
    'pages/crypto': () => import('./locales/chunks/uk/pages/crypto.json'),
    'pages/import-csv': () => import('./locales/chunks/uk/pages/import-csv.json'),
    'pages/import-statement': () => import('./locales/chunks/uk/pages/import-statement.json'),
    // Settings chunks
    'settings/index': () => import('./locales/chunks/uk/settings/index.json'),
    'settings/categories': () => import('./locales/chunks/uk/settings/categories.json'),
    'settings/tags': () => import('./locales/chunks/uk/settings/tags.json'),
    'settings/currencies': () => import('./locales/chunks/uk/settings/currencies.json'),
    'settings/accounts-groups': () => import('./locales/chunks/uk/settings/accounts-groups.json'),
    'settings/data-management': () => import('./locales/chunks/uk/settings/data-management.json'),
    'settings/preferences': () => import('./locales/chunks/uk/settings/preferences.json'),
    'settings/ai': () => import('./locales/chunks/uk/settings/ai.json'),
    'settings/security': () => import('./locales/chunks/uk/settings/security.json'),
    'settings/admin': () => import('./locales/chunks/uk/settings/admin.json'),
  },
};

// Create i18n instance with common chunk pre-loaded
export const i18n: I18n<Record<string, unknown>, {}, {}, SupportedLocale, false> = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    en: enCommon as Record<string, unknown>,
  },
  globalInjection: true,
  missingWarn: process.env.NODE_ENV === 'development',
  fallbackWarn: process.env.NODE_ENV === 'development',
});

/**
 * Load a specific chunk for a locale
 */
async function loadChunk({ locale, chunk }: { locale: string; chunk: I18nChunkName }): Promise<void> {
  const localeChunks = loadedChunks.get(locale) ?? new Set<I18nChunkName>();

  // Skip if already loaded
  if (localeChunks.has(chunk)) {
    return;
  }

  // Validate locale
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    console.warn(`Locale "${locale}" is not supported.`);
    return;
  }

  const loader = chunkRegistry[locale]?.[chunk];
  if (!loader) {
    console.warn(`Chunk "${chunk}" not found for locale "${locale}".`);
    return;
  }

  try {
    const messages = await loader();

    // Merge into existing messages
    i18n.global.mergeLocaleMessage(locale as SupportedLocale, messages.default as Record<string, unknown>);

    // Track as loaded
    localeChunks.add(chunk);
    loadedChunks.set(locale, localeChunks);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[i18n] Loaded chunk "${chunk}" for locale "${locale}"`);
    }
  } catch (error) {
    console.error(`Failed to load chunk "${chunk}" for locale "${locale}":`, error);
  }
}

/**
 * Load multiple chunks for a locale in parallel
 */
export async function loadChunks({ locale, chunks }: { locale: string; chunks: I18nChunkName[] }): Promise<void> {
  await Promise.all(chunks.map((chunk) => loadChunk({ locale, chunk })));
}

/**
 * Load chunks required for a route (collects from route and all parent routes)
 */
export async function loadChunksForRoute({ route }: { route: RouteLocationNormalized }): Promise<void> {
  const locale = i18n.global.locale.value;
  const requiredChunks = new Set<I18nChunkName>();

  // Collect chunks from route and all matched (parent) routes
  for (const matched of route.matched) {
    const chunks = matched.meta?.i18nChunks;
    if (chunks) {
      chunks.forEach((chunk) => requiredChunks.add(chunk));
    }
  }

  if (requiredChunks.size > 0) {
    await loadChunks({ locale, chunks: Array.from(requiredChunks) });
  }
}

/**
 * Reload all loaded chunks when locale changes
 */
async function reloadChunksForLocale({ locale }: { locale: string }): Promise<void> {
  const currentLocale = i18n.global.locale.value;
  const currentChunks = loadedChunks.get(currentLocale);

  if (!currentChunks || currentChunks.size === 0) {
    // At minimum, load the common chunk
    await loadChunk({ locale, chunk: 'common' });
    return;
  }

  // Load all previously loaded chunks for the new locale
  await loadChunks({ locale, chunks: Array.from(currentChunks) });
}

/**
 * Get current locale
 */
export function getCurrentLocale(): string {
  return i18n.global.locale.value;
}

/**
 * Set locale (will reload chunks if needed)
 */
export async function setLocale(locale: string): Promise<void> {
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    console.warn(`Locale "${locale}" is not supported.`);
    return;
  }

  // Reload all chunks for the new locale
  await reloadChunksForLocale({ locale });

  // Switch to the new locale
  i18n.global.locale.value = locale as SupportedLocale;

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
