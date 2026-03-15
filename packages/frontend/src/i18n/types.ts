/**
 * i18n chunk types for lazy loading locale messages by route
 */

// All available chunk names
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const I18N_CHUNKS = [
  // Core - always or frequently loaded
  'common',
  'layout',
  'dialogs',
  'forms',
  'errors',
  // Auth pages
  'auth/sign-in',
  'auth/sign-up',
  'auth/verify-email',
  'auth/welcome',
  // Main pages
  'pages/dashboard',
  'pages/accounts',
  'pages/account',
  'pages/account-integrations',
  'pages/transactions',
  'pages/budgets',
  'pages/budget-details',
  'pages/analytics',
  'pages/investments',
  'pages/portfolio-detail',
  'pages/crypto',
  'pages/import-csv',
  'pages/import-statement',
  'pages/planned',
  // Settings subpages
  'settings/index',
  'settings/categories',
  'settings/tags',
  'settings/currencies',
  'settings/accounts-groups',
  'settings/data-management',
  'settings/preferences',
  'settings/ai',
  'settings/security',
  'settings/admin',
] as const;

export type I18nChunkName = (typeof I18N_CHUNKS)[number];

// Extend vue-router RouteMeta to include i18nChunks
declare module 'vue-router' {
  interface RouteMeta {
    /**
     * i18n chunks to load for this route.
     * Chunks from parent routes are automatically inherited.
     */
    i18nChunks?: I18nChunkName[];
  }
}

// Type for tracking loaded chunks per locale
export type LoadedChunksMap = Map<string, Set<I18nChunkName>>;

// Type for chunk loader function
type ChunkLoader = () => Promise<{ default: Record<string, unknown> }>;

// Type for chunk registry (maps locale -> chunk name -> loader)
export type ChunkRegistry = Record<string, Partial<Record<I18nChunkName, ChunkLoader>>>;
