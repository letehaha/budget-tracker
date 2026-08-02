import type { MsMoneyParseResult } from '@bt/shared/types';
import { MS_MONEY_UPLOAD_TTL_MS } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Disk cache of parsed `.mny` uploads, one JSON file per upload.
 *
 * A Money file is a binary database that can be tens of megabytes, so it is
 * uploaded and parsed exactly once and only the parse result is kept. The wizard
 * steps that follow send the `uploadId` instead of the file, which keeps the
 * bytes out of every later request body and out of the BullMQ job payload.
 */
const UPLOAD_DIR = join(tmpdir(), 'budget-tracker-ms-money-uploads');

/** Every miss reports the same thing. Whether the entry expired, never existed,
 *  or belongs to somebody else is not the user's problem — and not something to
 *  tell an attacker probing ids. */
const UPLOAD_MISSING_MESSAGE = 'This Microsoft Money upload is no longer available. Please upload the file again.';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CachedUpload {
  /** ISO instant after which this entry is treated as missing. */
  expiresAt: string;
  result: MsMoneyParseResult;
}

/**
 * The id arrives straight from a request body, so anything that is not a plain
 * UUID is refused before it reaches the filesystem: a value containing `..` or a
 * separator would otherwise let a caller point the read at a file outside the
 * upload directory.
 */
function assertPlainUploadId({ uploadId }: { uploadId: string }): void {
  if (!UUID_PATTERN.test(uploadId)) {
    throw new NotFoundError({ message: UPLOAD_MISSING_MESSAGE });
  }
}

/**
 * The owner's id is part of the filename, so reads are scoped by construction —
 * another user asking for the same `uploadId` builds a path that does not exist.
 */
function uploadPath({ userId, uploadId }: { userId: number; uploadId: string }): string {
  return join(UPLOAD_DIR, `${userId}-${uploadId}.json`);
}

/**
 * Delete entries older than the TTL. Entries are written once and never updated,
 * so the file mtime is the store time — cheaper than opening and parsing every
 * cached result just to read its expiry back.
 */
async function sweepExpiredUploads(): Promise<void> {
  const cutoff = Date.now() - MS_MONEY_UPLOAD_TTL_MS;

  for (const entry of await readdir(UPLOAD_DIR)) {
    if (!entry.endsWith('.json')) continue;
    const filePath = join(UPLOAD_DIR, entry);
    const stats = await stat(filePath);
    if (stats.mtimeMs <= cutoff) await unlink(filePath);
  }
}

/**
 * Cache one parse result and hand back the id later steps reference it by.
 */
export async function storeMsMoneyUpload({
  userId,
  result,
}: {
  userId: number;
  result: MsMoneyParseResult;
}): Promise<{ uploadId: string; expiresAt: Date }> {
  await mkdir(UPLOAD_DIR, { recursive: true, mode: 0o700 });

  // Best effort: a failed sweep only leaves abandoned entries on disk for
  // another round, so it must never fail the upload the user is waiting on.
  try {
    await sweepExpiredUploads();
  } catch (err) {
    logger.error({ message: '[MS Money import] Failed to sweep expired uploads', error: err as Error });
  }

  const uploadId = randomUUID();
  const expiresAt = new Date(Date.now() + MS_MONEY_UPLOAD_TTL_MS);
  const cached: CachedUpload = { expiresAt: expiresAt.toISOString(), result };

  // 0600 because the entry holds the user's whole transaction history and the
  // system temp directory is readable by every account on the host.
  await writeFile(uploadPath({ userId, uploadId }), JSON.stringify(cached), { encoding: 'utf8', mode: 0o600 });

  return { uploadId, expiresAt };
}

/**
 * Confirm an upload is still readable without loading it. The execute step only
 * needs to know the id is good before it queues a job, and the worker reads the
 * result anyway — parsing a multi-megabyte entry twice would double the memory
 * cost for nothing. Throws the same `NotFoundError` as a real read.
 */
export async function assertMsMoneyUploadExists({
  userId,
  uploadId,
}: {
  userId: number;
  uploadId: string;
}): Promise<void> {
  assertPlainUploadId({ uploadId });

  let stats: Stats;
  try {
    stats = await stat(uploadPath({ userId, uploadId }));
  } catch {
    throw new NotFoundError({ message: UPLOAD_MISSING_MESSAGE });
  }

  // Entries are written once and never updated, so the file mtime is the store
  // time — the same signal the sweeper uses.
  if (Date.now() - stats.mtimeMs > MS_MONEY_UPLOAD_TTL_MS) {
    await deleteMsMoneyUpload({ userId, uploadId });
    throw new NotFoundError({ message: UPLOAD_MISSING_MESSAGE });
  }
}

/**
 * Read a cached parse result back. Throws `NotFoundError` when the entry is
 * gone, expired, unreadable, or owned by another user.
 */
export async function readMsMoneyUpload({
  userId,
  uploadId,
}: {
  userId: number;
  uploadId: string;
}): Promise<MsMoneyParseResult> {
  assertPlainUploadId({ uploadId });

  let raw: string;
  try {
    raw = await readFile(uploadPath({ userId, uploadId }), 'utf8');
  } catch {
    throw new NotFoundError({ message: UPLOAD_MISSING_MESSAGE });
  }

  let cached: CachedUpload;
  try {
    cached = JSON.parse(raw) as CachedUpload;
  } catch {
    // A truncated or corrupted entry can never become readable, so drop it
    // instead of leaving it to fail every retry until the sweeper catches up.
    await deleteMsMoneyUpload({ userId, uploadId });
    throw new NotFoundError({ message: UPLOAD_MISSING_MESSAGE });
  }

  const expiresAtMs = new Date(cached.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    await deleteMsMoneyUpload({ userId, uploadId });
    throw new NotFoundError({ message: UPLOAD_MISSING_MESSAGE });
  }

  return cached.result;
}

/** Drop a cached upload. Already-gone entries are fine — the sweeper and a
 *  finished import both delete, and either may get there first. */
export async function deleteMsMoneyUpload({ userId, uploadId }: { userId: number; uploadId: string }): Promise<void> {
  assertPlainUploadId({ uploadId });

  try {
    await unlink(uploadPath({ userId, uploadId }));
  } catch {
    // Nothing to delete.
  }
}
