import type { BackupRestorePhase } from '@bt/shared/types';

/**
 * Maps each backup-restore phase to its i18n key, shared by the restore dialog and
 * the global blocking overlay so both render the same phase copy.
 *
 * Declared in the backend's restore order (see BackupRestorePhase) so the key order
 * is the source for the overlay's phase numbering, and `satisfies` breaks the build
 * if a backend phase is added or renamed instead of silently rendering a raw key.
 */
export const RESTORE_PHASE_LABEL_KEYS = {
  validating: 'settings.security.backup.restore.progress.phases.validating',
  'preparing-securities': 'settings.security.backup.restore.progress.phases.preparingSecurities',
  wiping: 'settings.security.backup.restore.progress.phases.wiping',
  restoring: 'settings.security.backup.restore.progress.phases.restoring',
  finalizing: 'settings.security.backup.restore.progress.phases.finalizing',
} satisfies Record<BackupRestorePhase, string>;
