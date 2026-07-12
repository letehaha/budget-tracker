import { type I18n, createI18n } from 'vue-i18n';
import type { RouteLocationNormalized } from 'vue-router';

// Import common chunk synchronously for initial load (en only)
import enCommon from './locales/chunks/en/common.json';
import type { ChunkRegistry, I18nChunkName, LoadedChunksMap } from './types';

// Supported locales
const SUPPORTED_LOCALES = ['en', 'uk', 'es', 'id'] as const;
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
    'auth/oauth-authorize': () => import('./locales/chunks/en/auth/oauth-authorize.json'),
    // Page chunks
    'pages/dashboard': () => import('./locales/chunks/en/pages/dashboard.json'),
    'pages/accounts': () => import('./locales/chunks/en/pages/accounts.json'),
    'pages/account': () => import('./locales/chunks/en/pages/account.json'),
    'pages/account-integrations': () => import('./locales/chunks/en/pages/account-integrations.json'),
    'pages/import-shared': () => import('./locales/chunks/en/pages/import-shared.json'),
    'pages/transactions': () => import('./locales/chunks/en/pages/transactions.json'),
    'pages/budgets': () => import('./locales/chunks/en/pages/budgets.json'),
    'pages/budget-details': () => import('./locales/chunks/en/pages/budget-details.json'),
    'pages/analytics': () => import('./locales/chunks/en/pages/analytics.json'),
    'pages/investments': () => import('./locales/chunks/en/pages/investments.json'),
    'pages/loans': () => import('./locales/chunks/en/pages/loans.json'),
    'pages/portfolio-detail': () => import('./locales/chunks/en/pages/portfolio-detail.json'),
    'pages/venture': () => import('./locales/chunks/en/pages/venture.json'),
    'pages/import-csv': () => import('./locales/chunks/en/pages/import-csv.json'),
    'pages/import-statement': () => import('./locales/chunks/en/pages/import-statement.json'),
    'pages/import-ynab': () => import('./locales/chunks/en/pages/import-ynab.json'),
    'pages/import-budget-bakers-wallet': () => import('./locales/chunks/en/pages/import-budget-bakers-wallet.json'),
    'pages/investments-import': () => import('./locales/chunks/en/pages/investments-import.json'),
    'pages/planned': () => import('./locales/chunks/en/pages/planned.json'),
    'pages/optimizations': () => import('./locales/chunks/en/pages/optimizations.json'),
    'pages/shared-with-me': () => import('./locales/chunks/en/pages/shared-with-me.json'),
    'pages/household': () => import('./locales/chunks/en/pages/household.json'),
    'pages/payees': () => import('./locales/chunks/en/pages/payees.json'),
    // Settings chunks
    'settings/index': () => import('./locales/chunks/en/settings/index.json'),
    'settings/categories': () => import('./locales/chunks/en/settings/categories.json'),
    'settings/tags': () => import('./locales/chunks/en/settings/tags.json'),
    'settings/currencies': () => import('./locales/chunks/en/settings/currencies.json'),
    'settings/accounts-groups': () => import('./locales/chunks/en/settings/accounts-groups.json'),
    'settings/data-management': () => import('./locales/chunks/en/settings/data-management.json'),
    'settings/appearance': () => import('./locales/chunks/en/settings/appearance.json'),
    'settings/language': () => import('./locales/chunks/en/settings/language.json'),
    'settings/statistics': () => import('./locales/chunks/en/settings/statistics.json'),
    'settings/ai': () => import('./locales/chunks/en/settings/ai.json'),
    'settings/security': () => import('./locales/chunks/en/settings/security.json'),
    'settings/admin': () => import('./locales/chunks/en/settings/admin.json'),
    'settings/subscriptions': () => import('./locales/chunks/en/settings/subscriptions.json'),
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
    'auth/oauth-authorize': () => import('./locales/chunks/uk/auth/oauth-authorize.json'),
    // Page chunks
    'pages/dashboard': () => import('./locales/chunks/uk/pages/dashboard.json'),
    'pages/accounts': () => import('./locales/chunks/uk/pages/accounts.json'),
    'pages/account': () => import('./locales/chunks/uk/pages/account.json'),
    'pages/account-integrations': () => import('./locales/chunks/uk/pages/account-integrations.json'),
    'pages/import-shared': () => import('./locales/chunks/uk/pages/import-shared.json'),
    'pages/transactions': () => import('./locales/chunks/uk/pages/transactions.json'),
    'pages/budgets': () => import('./locales/chunks/uk/pages/budgets.json'),
    'pages/budget-details': () => import('./locales/chunks/uk/pages/budget-details.json'),
    'pages/analytics': () => import('./locales/chunks/uk/pages/analytics.json'),
    'pages/investments': () => import('./locales/chunks/uk/pages/investments.json'),
    'pages/loans': () => import('./locales/chunks/uk/pages/loans.json'),
    'pages/portfolio-detail': () => import('./locales/chunks/uk/pages/portfolio-detail.json'),
    'pages/venture': () => import('./locales/chunks/uk/pages/venture.json'),
    'pages/import-csv': () => import('./locales/chunks/uk/pages/import-csv.json'),
    'pages/import-statement': () => import('./locales/chunks/uk/pages/import-statement.json'),
    'pages/import-ynab': () => import('./locales/chunks/uk/pages/import-ynab.json'),
    'pages/import-budget-bakers-wallet': () => import('./locales/chunks/uk/pages/import-budget-bakers-wallet.json'),
    'pages/investments-import': () => import('./locales/chunks/uk/pages/investments-import.json'),
    'pages/planned': () => import('./locales/chunks/uk/pages/planned.json'),
    'pages/optimizations': () => import('./locales/chunks/uk/pages/optimizations.json'),
    'pages/shared-with-me': () => import('./locales/chunks/uk/pages/shared-with-me.json'),
    'pages/household': () => import('./locales/chunks/uk/pages/household.json'),
    'pages/payees': () => import('./locales/chunks/uk/pages/payees.json'),
    // Settings chunks
    'settings/index': () => import('./locales/chunks/uk/settings/index.json'),
    'settings/categories': () => import('./locales/chunks/uk/settings/categories.json'),
    'settings/tags': () => import('./locales/chunks/uk/settings/tags.json'),
    'settings/currencies': () => import('./locales/chunks/uk/settings/currencies.json'),
    'settings/accounts-groups': () => import('./locales/chunks/uk/settings/accounts-groups.json'),
    'settings/data-management': () => import('./locales/chunks/uk/settings/data-management.json'),
    'settings/appearance': () => import('./locales/chunks/uk/settings/appearance.json'),
    'settings/language': () => import('./locales/chunks/uk/settings/language.json'),
    'settings/statistics': () => import('./locales/chunks/uk/settings/statistics.json'),
    'settings/ai': () => import('./locales/chunks/uk/settings/ai.json'),
    'settings/security': () => import('./locales/chunks/uk/settings/security.json'),
    'settings/admin': () => import('./locales/chunks/uk/settings/admin.json'),
    'settings/subscriptions': () => import('./locales/chunks/uk/settings/subscriptions.json'),
  },
  es: {
    // Core chunks
    common: () => import('./locales/chunks/es/common.json'),
    layout: () => import('./locales/chunks/es/layout.json'),
    dialogs: () => import('./locales/chunks/es/dialogs.json'),
    forms: () => import('./locales/chunks/es/forms.json'),
    errors: () => import('./locales/chunks/es/errors.json'),
    // Auth chunks
    'auth/sign-in': () => import('./locales/chunks/es/auth/sign-in.json'),
    'auth/sign-up': () => import('./locales/chunks/es/auth/sign-up.json'),
    'auth/verify-email': () => import('./locales/chunks/es/auth/verify-email.json'),
    'auth/welcome': () => import('./locales/chunks/es/auth/welcome.json'),
    'auth/oauth-authorize': () => import('./locales/chunks/es/auth/oauth-authorize.json'),
    // Page chunks
    'pages/dashboard': () => import('./locales/chunks/es/pages/dashboard.json'),
    'pages/accounts': () => import('./locales/chunks/es/pages/accounts.json'),
    'pages/account': () => import('./locales/chunks/es/pages/account.json'),
    'pages/account-integrations': () => import('./locales/chunks/es/pages/account-integrations.json'),
    'pages/import-shared': () => import('./locales/chunks/es/pages/import-shared.json'),
    'pages/transactions': () => import('./locales/chunks/es/pages/transactions.json'),
    'pages/budgets': () => import('./locales/chunks/es/pages/budgets.json'),
    'pages/budget-details': () => import('./locales/chunks/es/pages/budget-details.json'),
    'pages/analytics': () => import('./locales/chunks/es/pages/analytics.json'),
    'pages/investments': () => import('./locales/chunks/es/pages/investments.json'),
    'pages/loans': () => import('./locales/chunks/es/pages/loans.json'),
    'pages/portfolio-detail': () => import('./locales/chunks/es/pages/portfolio-detail.json'),
    'pages/venture': () => import('./locales/chunks/es/pages/venture.json'),
    'pages/import-csv': () => import('./locales/chunks/es/pages/import-csv.json'),
    'pages/import-statement': () => import('./locales/chunks/es/pages/import-statement.json'),
    'pages/import-ynab': () => import('./locales/chunks/es/pages/import-ynab.json'),
    'pages/import-budget-bakers-wallet': () => import('./locales/chunks/es/pages/import-budget-bakers-wallet.json'),
    'pages/investments-import': () => import('./locales/chunks/es/pages/investments-import.json'),
    'pages/planned': () => import('./locales/chunks/es/pages/planned.json'),
    'pages/optimizations': () => import('./locales/chunks/es/pages/optimizations.json'),
    'pages/shared-with-me': () => import('./locales/chunks/es/pages/shared-with-me.json'),
    'pages/household': () => import('./locales/chunks/es/pages/household.json'),
    'pages/payees': () => import('./locales/chunks/es/pages/payees.json'),
    // Settings chunks
    'settings/index': () => import('./locales/chunks/es/settings/index.json'),
    'settings/categories': () => import('./locales/chunks/es/settings/categories.json'),
    'settings/tags': () => import('./locales/chunks/es/settings/tags.json'),
    'settings/currencies': () => import('./locales/chunks/es/settings/currencies.json'),
    'settings/accounts-groups': () => import('./locales/chunks/es/settings/accounts-groups.json'),
    'settings/data-management': () => import('./locales/chunks/es/settings/data-management.json'),
    'settings/appearance': () => import('./locales/chunks/es/settings/appearance.json'),
    'settings/language': () => import('./locales/chunks/es/settings/language.json'),
    'settings/statistics': () => import('./locales/chunks/es/settings/statistics.json'),
    'settings/ai': () => import('./locales/chunks/es/settings/ai.json'),
    'settings/security': () => import('./locales/chunks/es/settings/security.json'),
    'settings/admin': () => import('./locales/chunks/es/settings/admin.json'),
    'settings/subscriptions': () => import('./locales/chunks/es/settings/subscriptions.json'),
  },
  id: {
    // Core chunks
    common: () => import('./locales/chunks/id/common.json'),
    layout: () => import('./locales/chunks/id/layout.json'),
    dialogs: () => import('./locales/chunks/id/dialogs.json'),
    forms: () => import('./locales/chunks/id/forms.json'),
    errors: () => import('./locales/chunks/id/errors.json'),
    // Auth chunks
    'auth/sign-in': () => import('./locales/chunks/id/auth/sign-in.json'),
    'auth/sign-up': () => import('./locales/chunks/id/auth/sign-up.json'),
    'auth/verify-email': () => import('./locales/chunks/id/auth/verify-email.json'),
    'auth/welcome': () => import('./locales/chunks/id/auth/welcome.json'),
    'auth/oauth-authorize': () => import('./locales/chunks/id/auth/oauth-authorize.json'),
    // Page chunks
    'pages/dashboard': () => import('./locales/chunks/id/pages/dashboard.json'),
    'pages/accounts': () => import('./locales/chunks/id/pages/accounts.json'),
    'pages/account': () => import('./locales/chunks/id/pages/account.json'),
    'pages/account-integrations': () => import('./locales/chunks/id/pages/account-integrations.json'),
    'pages/import-shared': () => import('./locales/chunks/id/pages/import-shared.json'),
    'pages/transactions': () => import('./locales/chunks/id/pages/transactions.json'),
    'pages/budgets': () => import('./locales/chunks/id/pages/budgets.json'),
    'pages/budget-details': () => import('./locales/chunks/id/pages/budget-details.json'),
    'pages/analytics': () => import('./locales/chunks/id/pages/analytics.json'),
    'pages/investments': () => import('./locales/chunks/id/pages/investments.json'),
    'pages/loans': () => import('./locales/chunks/id/pages/loans.json'),
    'pages/portfolio-detail': () => import('./locales/chunks/id/pages/portfolio-detail.json'),
    'pages/venture': () => import('./locales/chunks/id/pages/venture.json'),
    'pages/import-csv': () => import('./locales/chunks/id/pages/import-csv.json'),
    'pages/import-statement': () => import('./locales/chunks/id/pages/import-statement.json'),
    'pages/import-ynab': () => import('./locales/chunks/id/pages/import-ynab.json'),
    'pages/import-budget-bakers-wallet': () => import('./locales/chunks/id/pages/import-budget-bakers-wallet.json'),
    'pages/investments-import': () => import('./locales/chunks/id/pages/investments-import.json'),
    'pages/planned': () => import('./locales/chunks/id/pages/planned.json'),
    'pages/optimizations': () => import('./locales/chunks/id/pages/optimizations.json'),
    'pages/shared-with-me': () => import('./locales/chunks/id/pages/shared-with-me.json'),
    'pages/household': () => import('./locales/chunks/id/pages/household.json'),
    'pages/payees': () => import('./locales/chunks/id/pages/payees.json'),
    // Settings chunks
    'settings/index': () => import('./locales/chunks/id/settings/index.json'),
    'settings/categories': () => import('./locales/chunks/id/settings/categories.json'),
    'settings/tags': () => import('./locales/chunks/id/settings/tags.json'),
    'settings/currencies': () => import('./locales/chunks/id/settings/currencies.json'),
    'settings/accounts-groups': () => import('./locales/chunks/id/settings/accounts-groups.json'),
    'settings/data-management': () => import('./locales/chunks/id/settings/data-management.json'),
    'settings/appearance': () => import('./locales/chunks/id/settings/appearance.json'),
    'settings/language': () => import('./locales/chunks/id/settings/language.json'),
    'settings/statistics': () => import('./locales/chunks/id/settings/statistics.json'),
    'settings/ai': () => import('./locales/chunks/id/settings/ai.json'),
    'settings/security': () => import('./locales/chunks/id/settings/security.json'),
    'settings/admin': () => import('./locales/chunks/id/settings/admin.json'),
    'settings/subscriptions': () => import('./locales/chunks/id/settings/subscriptions.json'),
  },
};

// Create i18n instance with common chunk pre-loaded
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const i18n: I18n<any, {}, {}, string, false> = createI18n<{}, string, false>({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    en: enCommon,
  },
  globalInjection: true,
  missingWarn: process.env.NODE_ENV === 'development',
  fallbackWarn: process.env.NODE_ENV === 'development',
});

/**
 * Load a specific chunk for a locale
 */
async function loadChunk({ locale, chunk }: { locale: string; chunk: I18nChunkName }): Promise<void> {
  // Create + store the per-locale Set synchronously (pre-await) so parallel
  // loadChunk calls share one reference; otherwise the last resolver overwrites
  // the others and the tracked Set loses chunks setLocale() then re-fetches.
  let localeChunks = loadedChunks.get(locale);
  if (!localeChunks) {
    localeChunks = new Set<I18nChunkName>();
    loadedChunks.set(locale, localeChunks);
  }

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

// Per-chunk load promises keyed by chunk name. Used by components that can
// appear outside their owning route (e.g. dialogs opened from a global field)
// to dedupe concurrent ensure-calls across component instances. The locale
// dimension is intentionally omitted: setLocale() reloads every chunk already
// tracked in loadedChunks, so a resolved promise from a prior locale still
// reflects messages-present in the new locale.
const ensureChunkPromises = new Map<I18nChunkName, Promise<void>>();

/**
 * Ensure a chunk is loaded for the current locale. Subsequent calls reuse the
 * in-flight or resolved promise, so callers can invoke this on every mount
 * without worrying about duplicate network requests.
 */
export function ensureChunkLoaded(chunk: I18nChunkName): Promise<void> {
  let promise = ensureChunkPromises.get(chunk);
  if (!promise) {
    promise = loadChunks({ locale: getCurrentLocale(), chunks: [chunk] });
    ensureChunkPromises.set(chunk, promise);
  }
  return promise;
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
