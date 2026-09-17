import { trackEvent } from '../index';

export function trackBackupExported({ userId, sizeBytes }: { userId: string | number; sizeBytes: number }): void {
  trackEvent({
    userId,
    event: 'backup_exported',
    properties: { size_bytes: sizeBytes },
  });
}

/**
 * `source_*` come from the archive's manifest, i.e. the account the backup was
 * exported from. A mismatch with the restoring user means data moved between accounts.
 */
export function trackBackupRestored({
  userId,
  sourceUsername,
  sourceEmail,
  backupExportedAt,
}: {
  userId: string | number;
  sourceUsername?: string;
  sourceEmail?: string | null;
  backupExportedAt?: string;
}): void {
  trackEvent({
    userId,
    event: 'backup_restored',
    properties: {
      source_username: sourceUsername,
      source_email: sourceEmail,
      backup_exported_at: backupExportedAt,
    },
  });
}
