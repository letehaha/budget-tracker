import { BACKUP_FORMAT_VERSION, type BackupManifest, type BackupManifestFileEntry } from '@bt/shared/types';
import { connection } from '@models/index';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { BackupFile } from './dump-tables.service';

function sha256Hex({ buffer }: { buffer: Buffer }): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Backend package version, informational-only in the manifest. package.json
 * sits three levels above this file in both src/ and the compiled dist/, so the
 * same relative path resolves in either. Fallback keeps export working even if
 * the file layout changes.
 */
function readAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return process.env.npm_package_version ?? 'unknown';
  }
}

/**
 * Newest applied migration filename. Migration names are timestamp-prefixed, so
 * lexical max is chronological max. Informational-only in v1; null if the meta
 * table can't be read.
 */
async function readLatestMigration(): Promise<string | null> {
  try {
    const [rows] = (await connection.sequelize.query(
      'SELECT name FROM "SequelizeMeta" ORDER BY name DESC LIMIT 1',
    )) as [{ name: string }[], unknown];
    return rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Build `manifest.json` last, after every other file exists, so it can carry
 * their SHA-256s (the manifest can't checksum itself, so it's absent from
 * `files`).
 */
export async function buildBackupManifest({
  files,
  exportedAt,
  user,
}: {
  files: BackupFile[];
  exportedAt: Date;
  user: { username: string; email: string | null };
}): Promise<BackupManifest> {
  const fileEntries: Record<string, BackupManifestFileEntry> = {};
  for (const file of files) {
    fileEntries[file.path] = { rows: file.rows, sha256: sha256Hex({ buffer: file.buffer }) };
  }

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: readAppVersion(),
    latestMigration: await readLatestMigration(),
    exportedAt: exportedAt.toISOString(),
    user,
    files: fileEntries,
  };
}
