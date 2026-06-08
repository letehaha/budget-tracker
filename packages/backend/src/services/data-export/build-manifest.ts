import { createHash } from 'node:crypto';

import {
  EXPORT_SCHEMA_VERSION,
  type BuiltFile,
  type ExportDateRange,
  type ExportFormat,
  type ExportGroup,
  type ExportManifest,
  type ManifestFileEntry,
} from './types';

function sha256Hex({ buffer }: { buffer: Buffer }): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Produce the manifest that travels alongside the data files in the zip.
 *
 * The manifest's SHA-256 entries let downstream tooling (or a curious user
 * with `shasum`) confirm the zip wasn't truncated or tampered with in
 * transit. We compute checksums after the files exist (chicken-and-egg –
 * the manifest can't include its own checksum), so the manifest itself is
 * intentionally absent from `files[]`.
 */
export function buildManifest({
  files,
  format,
  groups,
  exportedAt,
  dateRange,
}: {
  files: BuiltFile[];
  format: ExportFormat;
  groups: ExportGroup[];
  exportedAt: Date;
  dateRange?: ExportDateRange;
}): ExportManifest {
  const fileEntries: ManifestFileEntry[] = files.map((file) => ({
    filename: file.filename,
    sha256: sha256Hex({ buffer: file.buffer }),
    sizeBytes: file.buffer.length,
    rowCount: file.rowCount,
  }));

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    format,
    groups,
    files: fileEntries,
    ...(dateRange ? { dateRange } : {}),
  };
}

export function serializeManifest({ manifest }: { manifest: ExportManifest }): Buffer {
  return Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
}
