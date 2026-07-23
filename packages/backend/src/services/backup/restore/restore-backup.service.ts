import type { BackupRestoreProgress, BackupRestoreSummary, BackupRestoreWarning } from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import { namespace } from '@models/connection';
import UserSettings, { ZodSettingsSchema } from '@models/user-settings.model';
import Users from '@models/users.model';
import { runUserDestroyLifecycle } from '@services/user/user-destroy-lifecycle';
import { destroyUserOwnedData } from '@services/user/wipe-user-data.service';
import type { Transaction } from 'sequelize';

import { BACKUP_TABLES } from '../registry';
import { analyzeArchive } from './analyze-archive';
import { loadBackupArchive, type ParsedArchive } from './load-archive';
import { USER_ROW_GUARDED_FK, foreignReferenceNulledMessage } from './owned-reference-guard';
import { resolveSecurities } from './resolve-securities';
import { insertRestoreTables, purgeUserOwnedRestoreTables } from './restore-tables';

type Row = Record<string, unknown>;
type ProgressCallback = (progress: BackupRestoreProgress) => void | Promise<void>;

const USER_RESTORE_FIELDS = BACKUP_TABLES.find((def) => def.restoreMode === 'updateUser')?.fields ?? [];

/** UPDATE the target Users row with the tier-1 restorable fields only. Identity
 *  (id/username/email/authUserId/role) is never touched. Category UUIDs are
 *  preserved, so `defaultCategoryId` needs no remap — but a hand-edited archive
 *  can point it at another user's category, so it's validated against the
 *  categories actually inserted this restore and nulled (with a warning) when
 *  foreign. */
async function restoreUserRow({
  archive,
  user,
  restoredCategoryIds,
  warnings,
}: {
  archive: ParsedArchive;
  user: Users;
  restoredCategoryIds: Set<string>;
  warnings: BackupRestoreWarning[];
}): Promise<void> {
  const src = archive.user;
  if (!src) return;
  const update: Row = {};
  for (const field of USER_RESTORE_FIELDS) {
    if (field in src) update[field] = src[field];
  }

  const defaultCategoryId = update[USER_ROW_GUARDED_FK.attrName];
  if (defaultCategoryId != null && !restoredCategoryIds.has(String(defaultCategoryId))) {
    update[USER_ROW_GUARDED_FK.attrName] = null;
    warnings.push({
      code: 'foreign_reference_nulled',
      table: 'user',
      message: foreignReferenceNulledMessage({ table: 'user', column: USER_ROW_GUARDED_FK.attrName, count: 1 }),
      count: 1,
    });
  }

  if (Object.keys(update).length > 0) {
    await Users.update(update, { where: { id: user.id } });
  }
}

/** Recreate the user's settings row through the Zod schema (never a raw JSONB
 *  write) so a drifted blob is normalized/defaulted instead of restored blind.
 *  The wipe step already removed the old row in this transaction, so a settings
 *  row is always written here — falling back to schema defaults (with a warning)
 *  when the backup has none or its blob no longer validates, rather than leaving
 *  the user without any settings or failing the whole restore. */
async function upsertUserSettings({
  archive,
  userId,
  warnings,
}: {
  archive: ParsedArchive;
  userId: number;
  warnings: BackupRestoreWarning[];
}): Promise<void> {
  const rows = archive.data.get('user-settings') ?? [];
  const src = rows[0];

  if (!src || src.settings == null) {
    warnings.push({
      code: 'no_settings',
      table: 'user-settings',
      message: 'Backup had no saved settings; defaults were applied.',
    });
    await UserSettings.create({ userId, settings: ZodSettingsSchema.parse({}) });
    return;
  }

  const parsed = ZodSettingsSchema.safeParse(src.settings);
  if (!parsed.success) {
    // A backup taken across a settings-schema change can carry a blob the current
    // schema rejects. Reset to defaults and warn rather than aborting an otherwise
    // valid restore over a non-critical field.
    warnings.push({
      code: 'settings_reset',
      table: 'user-settings',
      message: 'Saved settings did not match the current schema and were reset to defaults.',
    });
    await UserSettings.create({ userId, settings: ZodSettingsSchema.parse({}) });
    return;
  }

  await UserSettings.create({ userId, settings: parsed.data });
}

/**
 * Restore a user's lossless backup, replacing all of their current data. The
 * securities catalog is resolved/created first, outside the transaction (global,
 * idempotent). Everything the user owns is then wiped and reinserted inside ONE
 * transaction via `runUserDestroyLifecycle`'s in-tx hook, so any failure rolls
 * back to the exact pre-restore state and the destroy's share-revocation
 * notifications still fan out on success.
 */
export async function restoreUserBackup({
  userId,
  fileContent,
  onProgress,
}: {
  userId: number;
  fileContent: string;
  onProgress?: ProgressCallback;
}): Promise<BackupRestoreSummary> {
  await onProgress?.({ phase: 'validating' });
  const archive = await loadBackupArchive({ fileContent });
  const analysis = analyzeArchive({ archive });
  if (analysis.hardFailReasons.length > 0) {
    throw new ValidationError({ message: analysis.hardFailReasons.join(' ') });
  }

  await onProgress?.({ phase: 'preparing-securities' });
  const securities = await resolveSecurities({ archive, analysis });

  const insertedByTable: Record<string, number> = { ...securities.insertedByTable };
  const warnings = [...analysis.warnings];

  await onProgress?.({ phase: 'wiping' });
  const destroyRan = await runUserDestroyLifecycle({
    userId,
    cacheLogPrefix: 'backup-restore',
    failureLogCode: 'BACKUP_RESTORE_FAILED',
    failureLogMessage: 'Backup restore failed',
    destroyInTx: async ({ user }) => {
      await destroyUserOwnedData({ user });

      const transaction = namespace.get('transaction') as Transaction | undefined;
      if (!transaction) {
        throw new Error('Backup restore expected an active transaction inside the destroy lifecycle.');
      }

      // Clear any user-owned rows the shared wipe leaves behind (it keeps the
      // Users row, so `userId`-cascade tables like Payees survive) before the
      // inserts re-add them under their preserved primary keys.
      await purgeUserOwnedRestoreTables({ userId: user.id, transaction });

      const tableResult = await insertRestoreTables({
        archive,
        analysis,
        targetUserId: user.id,
        securitiesRemap: securities.remap,
        transaction,
        onProgress: ({ tier, table, insertedRows }) => onProgress?.({ phase: 'restoring', tier, table, insertedRows }),
      });
      Object.assign(insertedByTable, tableResult.insertedByTable);
      warnings.push(...tableResult.warnings);

      const restoredCategoryIds = tableResult.insertedIds.get(USER_ROW_GUARDED_FK.targetTable) ?? new Set<string>();
      await restoreUserRow({ archive, user, restoredCategoryIds, warnings });
      await upsertUserSettings({ archive, userId: user.id, warnings });
    },
  });

  // The destroy lifecycle skips its in-tx hook (where every owner-scoped write
  // happens) when the target user row vanished mid-restore, returning cleanly. A
  // successful-looking resolve with nothing written would report bogus securities
  // counts, so fail loudly instead.
  if (!destroyRan) {
    throw new Error('Backup restore aborted: target user no longer exists.');
  }

  await onProgress?.({ phase: 'finalizing' });
  return { insertedByTable, warnings };
}
