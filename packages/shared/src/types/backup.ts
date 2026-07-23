/**
 * Shared contracts for the lossless Data Backup pipeline. Lives in the shared
 * package so the backend (registry, export service, restore preflight) and the
 * frontend (download/restore UI) branch on the same source of truth and cannot
 * drift independently.
 *
 * Distinct from Data Export (`data-export.ts`): export is human-readable and
 * lossy (names, decimals, no ids); backup is raw storage values and exact
 * ids for a full round-trip.
 */

import type { WipeDataSharedResources } from './api';

/**
 * On-disk backup shape version. Restore hard-fails a manifest whose
 * `formatVersion` is greater than this (app too old for the backup).
 */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Base names of the per-table files written under `data/` in the zip (one
 * `data/<name>.json` each). Mirrors `EXPORT_FILE_NAMES`: the registry's
 * module-load drift check compares its registered file names against this
 * array so a table added to the registry without a name here (or vice versa)
 * throws on load. Ordered by restore tier for readability only.
 */
export const BACKUP_FILE_NAMES = [
  // tier 1
  'user',
  // tier 2
  'user-settings',
  'users-currencies',
  'categories',
  'tags',
  'payees',
  'tag-reminders',
  'payee-ignored-names',
  'notifications',
  'venture-platforms',
  'bank-data-provider-connections',
  'account-groups',
  // tier 3
  'accounts',
  'account-groupings',
  'subscriptions',
  'payee-aliases',
  'payee-tags',
  'user-merchant-category-codes',
  'user-exchange-rates',
  'portfolios',
  'venture-deals',
  'vehicles',
  'loan-details',
  'transaction-groups',
  'budgets',
  // tier 4
  'transactions',
  'balances',
  'holdings',
  'investment-transactions',
  'portfolio-balances',
  'portfolio-transfers',
  'venture-events',
  'subscription-candidates',
  // tier 5
  'transaction-splits',
  'transaction-tags',
  'transaction-group-items',
  'budget-transactions',
  'budget-categories',
  'refund-transactions',
  'subscription-transactions',
  'subscription-periods',
  'transfer-suggestion-dismissals',
  'venture-event-links',
  // tier 6
  'subscription-period-notifications',
  // exported but skipped on restore (counterpart users don't exist cross-instance)
  'resource-shares',
  'share-invitations',
] as const;
export type BackupFileName = (typeof BACKUP_FILE_NAMES)[number];

/**
 * Global-catalog subset embedded under `reference/`. Securities are created
 * on-demand per instance with no natural-key fallback in holdings creation, so
 * restored holdings would dangle without these.
 */
export const BACKUP_REFERENCE_FILE_NAMES = ['securities', 'security-pricing'] as const;
export type BackupReferenceFileName = (typeof BACKUP_REFERENCE_FILE_NAMES)[number];

/** Per-file entry in the manifest's `files` map. Key is the zip path. */
export interface BackupManifestFileEntry {
  /** Row count in the file (1 for the single-object `data/user.json`). */
  rows: number;
  /** Hex SHA-256 of the file bytes, so a truncated/tampered zip is detectable. */
  sha256: string;
}

/**
 * `manifest.json` at the zip root. `user` and `latestMigration` are
 * informational only — restore targets the logged-in uploader and never
 * restores identity or migration state.
 */
export interface BackupManifest {
  formatVersion: number;
  appVersion: string;
  /** Newest applied migration filename at export time, or null if unknown. */
  latestMigration: string | null;
  exportedAt: string;
  user: { username: string; email: string | null };
  /** Keyed by zip path, e.g. `data/categories.json`. Excludes manifest.json itself. */
  files: Record<string, BackupManifestFileEntry>;
}

/**
 * Non-fatal restore outcomes surfaced in the job result. Restore succeeds
 * with these attached rather than failing the whole run.
 */
export type BackupRestoreWarningCode =
  | 'shares_skipped'
  | 'mcc_code_missing'
  | 'currency_missing'
  | 'unknown_table_ignored'
  | 'unknown_column_dropped'
  | 'table_missing_treated_empty'
  // Backed-up settings failed validation against the current schema; the row was
  // reset to defaults so the rest of the restore could still complete.
  | 'settings_reset'
  // The backup carried no settings row; the user's settings fell back to defaults.
  | 'no_settings';

export interface BackupRestoreWarning {
  code: BackupRestoreWarningCode;
  /** Table the warning applies to, when table-scoped. */
  table?: string;
  message: string;
  /** How many rows/columns the warning covers, when countable. */
  count?: number;
}

/** Coarse restore phases reported through job progress and the poll fallback. */
export type BackupRestorePhase = 'validating' | 'preparing-securities' | 'wiping' | 'restoring' | 'finalizing';

export interface BackupRestoreProgress {
  phase: BackupRestorePhase;
  /** Restore tier currently inserting, when phase is `restoring`. */
  tier?: number;
  table?: string;
  insertedRows?: number;
}

/** Final job payload: per-table inserted counts plus the warnings list. */
export interface BackupRestoreSummary {
  insertedByTable: Record<string, number>;
  warnings: BackupRestoreWarning[];
}

export type BackupRestoreJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Response of the restore status poll endpoint. */
export interface BackupRestoreStatusResponse {
  jobId: string;
  status: BackupRestoreJobStatus;
  progress?: BackupRestoreProgress;
  summary?: BackupRestoreSummary;
  /** Human-readable failure reason when status is `failed`. */
  error?: string;
}

/**
 * User-scoped restore status for `GET /user/backup/restore/status` (no job id).
 * A restore wipes and replaces every table, so any device must be able to learn a
 * restore is in flight at boot and block until it lands — the frontend calls this
 * on every boot, so it never 404s: `idle` covers "never ran" and "job aged out".
 *
 * State-based (not the poll endpoint's `status` field) so it plugs into the same
 * generic blocking-job watchdog as the base-currency change.
 */
export type BackupRestoreActiveStatus =
  | { state: 'idle' }
  | { state: 'queued'; jobId: string }
  | { state: 'running'; jobId: string; phase?: BackupRestorePhase; insertedRows?: number }
  | { state: 'completed'; jobId: string; summary: BackupRestoreSummary }
  | { state: 'failed'; jobId: string; error: string };

/**
 * `details` of the restore preflight's shared-resource acknowledgement gate.
 * Restore reuses the wipe flow's exact contract (HTTP 409 +
 * `API_ERROR_CODES.wipeDataSharingAcknowledgementRequired`) so the frontend
 * can share the wipe acknowledgement UX — this is an alias, not a new shape.
 */
export type BackupRestoreAckRequiredDetails = WipeDataSharedResources;

/**
 * SSE payload the restore worker pushes as it advances. The poll endpoint
 * (`BackupRestoreStatusResponse`) is the authoritative status source; this is
 * the live push variant, carrying the same coarse `phase` plus the standard
 * import-progress counters so the shared queue scaffold's default builders can
 * emit it unchanged.
 */
export interface BackupRestoreSseProgress {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  /** Coarse restore phase, mirrored from the job's persisted progress. */
  phase?: BackupRestorePhase;
  processedCount: number;
  totalCount: number;
  summary?: BackupRestoreSummary;
  error?: string;
}
