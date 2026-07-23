import {
  BACKUP_FILE_NAMES,
  BACKUP_FORMAT_VERSION,
  BACKUP_REFERENCE_FILE_NAMES,
  type BackupFileName,
  type BackupManifest,
} from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';

type Row = Record<string, unknown>;

/**
 * Hard ceiling on the archive's total uncompressed size. Preflight reads every
 * manifest-listed file fully into memory on the API thread, so an unbounded
 * DEFLATE archive (a ~48MB body can inflate to tens of GB) would OOM the shared
 * instance. 1 GiB is generous for a heavy real backup (JSON of every user-owned
 * table) while still bounding a zip bomb well short of memory exhaustion.
 */
const MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;

/**
 * Reject up front when the archive's declared uncompressed size blows the budget,
 * before a single file is decompressed. Reads JSZip's per-entry `uncompressedSize`
 * from the central directory; a malicious archive can understate it, which the
 * running byte tally during decompression then catches.
 */
function assertUncompressedBudget({ zip }: { zip: JSZip }): void {
  let declaredTotal = 0;
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof size === 'number') declaredTotal += size;
  }
  if (declaredTotal > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new ValidationError({
      message: 'Backup archive is too large to restore: its uncompressed contents exceed the size limit.',
    });
  }
}

/**
 * Parsed + integrity-checked backup archive. `data` holds the per-table row
 * arrays for every present data file; `user` is the single tier-1 object;
 * `reference` carries the resolve-or-create catalog subset.
 */
export interface ParsedArchive {
  manifest: BackupManifest;
  data: Map<BackupFileName, Row[]>;
  user: Row | null;
  reference: {
    securities: Row[];
    securityPricing: Row[];
  };
  /** Data files present in the zip whose base name isn't a known backup table. */
  unknownFileNames: string[];
}

function sha256Hex({ buffer }: { buffer: Buffer }): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** True only for a non-null, non-array object. Manifest fields are dereferenced
 *  blindly downstream, so a `null`/array/scalar manifest must be rejected as a
 *  422 here rather than throwing a raw TypeError that maps to a generic 500. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson({ buffer, path }: { buffer: Buffer; path: string }): unknown {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new ValidationError({ message: `Backup file ${path} is not valid JSON.` });
  }
}

/**
 * Decode the base64 zip, verify the manifest's format version and every file's
 * SHA-256, then parse each data/reference file. Throws a 422 `ValidationError`
 * with a human-readable reason on any structural failure (unreadable zip,
 * oversized contents, missing manifest, unsupported version, checksum mismatch,
 * malformed JSON) — the whole restore is rejected before it can touch the user's
 * data.
 */
export async function loadBackupArchive({ fileContent }: { fileContent: string }): Promise<ParsedArchive> {
  // `Buffer.from(str, 'base64')` never throws — it silently drops non-base64 chars
  // — so garbage input decodes to a (possibly empty) buffer and is caught by the
  // zip-load failure below rather than by a base64 guard here.
  const buffer = Buffer.from(fileContent, 'base64');

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ValidationError({ message: 'Backup upload is not a readable zip archive.' });
  }

  assertUncompressedBudget({ zip });

  // Running tally of bytes actually decompressed, so an archive that understated
  // its central-directory sizes still can't inflate past the budget in memory.
  let decompressedBytes = 0;
  const readEntry = async ({ file }: { file: JSZip.JSZipObject }): Promise<Buffer> => {
    const bytes = await file.async('nodebuffer');
    decompressedBytes += bytes.length;
    if (decompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ValidationError({
        message: 'Backup archive is too large to restore: its uncompressed contents exceed the size limit.',
      });
    }
    return bytes;
  };

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new ValidationError({ message: 'Backup archive is missing manifest.json.' });
  }
  const rawManifest = parseJson({
    buffer: await readEntry({ file: manifestFile }),
    path: 'manifest.json',
  });
  if (!isPlainObject(rawManifest)) {
    throw new ValidationError({ message: 'Backup archive has a malformed manifest.json (not a JSON object).' });
  }
  const manifest = rawManifest as unknown as BackupManifest;

  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new ValidationError({
      message: `Backup format version ${manifest.formatVersion} is newer than this app supports (max ${BACKUP_FORMAT_VERSION}). Update the app to restore it.`,
    });
  }

  // Verify every file the manifest vouches for. A missing or tampered file means
  // the upload is truncated/corrupt — safer to reject than to restore a partial.
  if (manifest.files !== undefined && !isPlainObject(manifest.files)) {
    throw new ValidationError({
      message: 'Backup archive has a malformed manifest.json (its file list is not an object).',
    });
  }
  const parsedByPath = new Map<string, unknown>();
  for (const [path, entry] of Object.entries(manifest.files ?? {})) {
    const file = zip.file(path);
    if (!file) {
      throw new ValidationError({ message: `Backup archive is missing ${path} listed in its manifest.` });
    }
    const bytes = await readEntry({ file });
    const digest = sha256Hex({ buffer: bytes });
    if (digest !== entry.sha256) {
      throw new ValidationError({ message: `Backup file ${path} failed its integrity check (checksum mismatch).` });
    }
    parsedByPath.set(path, parseJson({ buffer: bytes, path }));
  }

  const data = new Map<BackupFileName, Row[]>();
  let user: Row | null = null;
  for (const name of BACKUP_FILE_NAMES) {
    const path = `data/${name}.json`;
    if (!parsedByPath.has(path)) continue;
    const value = parsedByPath.get(path);
    if (name === 'user') {
      user = value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : null;
      continue;
    }
    data.set(name, Array.isArray(value) ? (value as Row[]) : []);
  }

  const referenceByName = new Map<string, Row[]>();
  for (const name of BACKUP_REFERENCE_FILE_NAMES) {
    const value = parsedByPath.get(`reference/${name}.json`);
    referenceByName.set(name, Array.isArray(value) ? (value as Row[]) : []);
  }

  // Data files the manifest carried that this app doesn't recognize — a backup
  // from a newer/divergent schema. Ignored on restore (warned, not fatal).
  const knownDataPaths = new Set(BACKUP_FILE_NAMES.map((n) => `data/${n}.json`));
  const unknownFileNames = [...parsedByPath.keys()]
    .filter((path) => path.startsWith('data/') && path.endsWith('.json') && !knownDataPaths.has(path))
    .map((path) => path.slice('data/'.length, -'.json'.length));

  return {
    manifest,
    data,
    user,
    reference: {
      securities: referenceByName.get('securities') ?? [],
      securityPricing: referenceByName.get('security-pricing') ?? [],
    },
    unknownFileNames,
  };
}
