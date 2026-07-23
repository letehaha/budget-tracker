import Users from '@models/users.model';
import JSZip from 'jszip';

import { dumpBackupFiles } from './dump-tables.service';
import { buildBackupManifest } from './manifest';

interface BackupExportResult {
  buffer: Buffer;
  filename: string;
  contentType: 'application/zip';
}

/** Strip characters that aren't safe in a download filename. */
function sanitizeForFilename({ value }: { value: string }): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'user';
}

function buildFilename({ username, exportedAt }: { username: string; exportedAt: Date }): string {
  const datePart = exportedAt.toISOString().slice(0, 10);
  return `backup-${sanitizeForFilename({ value: username })}-${datePart}.zip`;
}

/**
 * Lossless, machine-readable backup of everything one user owns, as a single
 * DEFLATE-compressed zip. Unlike Data Export (STORE, human-readable), the raw
 * JSON dumps here are large and repetitive, so real compression pays off.
 *
 * Synchronous read path: dumps are cheap `raw:true` selects, so no queue in v1.
 */
export async function exportUserBackup({ userId }: { userId: number }): Promise<BackupExportResult> {
  const exportedAt = new Date();

  const [files, user] = await Promise.all([
    dumpBackupFiles({ userId }),
    Users.findOne({ where: { id: userId }, attributes: ['username', 'email'], raw: true }) as unknown as Promise<{
      username: string;
      email: string | null;
    } | null>,
  ]);

  const manifest = await buildBackupManifest({
    files,
    exportedAt,
    user: { username: user?.username ?? '', email: user?.email ?? null },
  });
  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.buffer, { compression: 'DEFLATE' });
  }
  zip.file('manifest.json', manifestBuffer, { compression: 'DEFLATE' });
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return {
    buffer,
    filename: buildFilename({ username: user?.username ?? '', exportedAt }),
    contentType: 'application/zip',
  };
}
