/**
 * Shared contracts for the user data-export pipeline. Lives in the shared
 * package so backend (Zod schema, transformers, writers) and frontend (API
 * client, dialog UI) cannot drift independently.
 */

/** Bump when the on-disk shape of an export changes in a backwards-incompatible way. */
export const EXPORT_SCHEMA_VERSION = 1;

export const EXPORT_FORMATS = ['json', 'csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const ALL_EXPORT_GROUPS = ['transactions', 'budgets', 'subscriptions', 'investments'] as const;
export type ExportGroup = (typeof ALL_EXPORT_GROUPS)[number];

/**
 * Stable filenames the writers produce inside the zip. Frontend tooling
 * (re-zip / unpack helpers, future round-trip importer) and the backend
 * writers both branch on this set, so the literal lives in the shared
 * package as the single source of truth.
 */
export const EXPORT_FILE_NAMES = [
  'transactions',
  'accounts',
  'balances_history',
  'categories',
  'tags',
  'vehicles',
  'budgets',
  'subscriptions',
  'portfolios',
  'holdings',
  'investment_transactions',
  'portfolio_transfers',
] as const;
export type ExportFileName = (typeof EXPORT_FILE_NAMES)[number];

/**
 * Upper bound on combined output rows. Prevents a multi-year power-user from
 * synchronously generating a gigabyte zip on the API thread. The limit is
 * intentionally generous – typical users will fall well under it.
 */
export const MAX_EXPORT_ROWS = 250_000;

/**
 * Optional date range applied to time-anchored exports. ISO-date strings
 * (`YYYY-MM-DD`), interpreted as a closed interval.
 *
 * Only event tables filter on this range – transactions, balance history,
 * investment transactions, portfolio transfers. Reference tables (accounts,
 * categories, tags, vehicles, portfolios, holdings, budgets, subscriptions)
 * always emit all rows so the filtered CSV columns resolve to readable names
 * regardless of which window the user picked.
 *
 * Both bounds are optional: `{ from: '2024-01-01' }` means "from this day
 * onward", `{ to: '2024-12-31' }` means "everything up to this day", and an
 * empty object behaves like no filter at all.
 */
export interface ExportDateRange {
  from?: string;
  to?: string;
}

/**
 * Extract the `filename` token from a `Content-Disposition` header value.
 * Shared between the frontend API client and the backend e2e test helper –
 * the parsing rule is part of the export contract.
 */
export function parseFilenameFromContentDisposition({ header }: { header: string | null | undefined }): string | null {
  if (!header) return null;
  const match = header.match(/filename="?([^"]+)"?/);
  return match && match[1] ? match[1] : null;
}
