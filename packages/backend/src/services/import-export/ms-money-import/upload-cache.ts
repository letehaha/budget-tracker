import type { MsMoneyParseResult, ResourceLease } from '@bt/shared/types';
import { MS_MONEY_UPLOAD_IDLE_TTL_MS, MS_MONEY_UPLOAD_MAX_LIFETIME_MS } from '@bt/shared/types';
import { createExpiringUploadCache } from '@services/common/expiring-upload-cache';

/**
 * Disk cache of parsed `.mny` uploads.
 *
 * A Money file is a binary database that can be tens of megabytes, so it is
 * uploaded and parsed exactly once and only the parse result is kept. The wizard
 * steps that follow send the `uploadId` instead of the file, which keeps the
 * bytes out of every later request body and out of the BullMQ job payload.
 *
 * Exported whole so the resource-lease registry can hold it: refreshing goes
 * through the generic endpoint, which reaches the right cache by looking up a
 * lease type rather than calling anything here by name.
 */
export const msMoneyUploadCache = createExpiringUploadCache<MsMoneyParseResult>({
  namespace: 'budget-tracker-ms-money-uploads',
  idleTtlMs: MS_MONEY_UPLOAD_IDLE_TTL_MS,
  maxLifetimeMs: MS_MONEY_UPLOAD_MAX_LIFETIME_MS,
  // Every miss reports the same thing. Whether the entry expired, never existed,
  // or belongs to somebody else is not the user's problem — and not something to
  // tell an attacker probing ids.
  missingMessage: 'This Microsoft Money upload is no longer available. Please upload the file again.',
  claimedMessage: 'An import for this file is already in progress.',
});

/** Cache one parse result and hand back the id later steps reference it by. */
export async function storeMsMoneyUpload({
  userId,
  result,
}: {
  userId: number;
  result: MsMoneyParseResult;
}): Promise<{ uploadId: string; lease: ResourceLease }> {
  const { id, lease } = await msMoneyUploadCache.store({ userId, payload: result });
  return { uploadId: id, lease };
}

/**
 * Give an upload to one import job and pin it to its absolute deadline. The
 * wizard stops refreshing once it queues, and the worker only reads the parse
 * result when the job starts — which, behind a backlog, can be long after the
 * idle window would have run out. The claim is exclusive, so a second submit
 * cannot import the same ledger twice; `isClaimStale` decides whether the job
 * already on the upload is dead and its claim may be taken over. Never loads the
 * payload: parsing a multi-megabyte entry twice would double the memory cost for
 * nothing. Throws `NotFoundError` when the upload is gone, `ConflictError` when
 * it is claimed.
 */
export function claimMsMoneyUpload({
  userId,
  uploadId,
  jobId,
  isClaimStale,
}: {
  userId: number;
  uploadId: string;
  jobId: string;
  isClaimStale: ({ jobId }: { jobId: string }) => Promise<boolean>;
}): Promise<ResourceLease> {
  return msMoneyUploadCache.claim({ userId, id: uploadId, jobId, isClaimStale });
}

/**
 * Read a cached parse result back. Throws `NotFoundError` when the entry is
 * gone, expired, unreadable, or owned by another user.
 */
export function readMsMoneyUpload({
  userId,
  uploadId,
}: {
  userId: number;
  uploadId: string;
}): Promise<MsMoneyParseResult> {
  return msMoneyUploadCache.read({ userId, id: uploadId });
}

/** Drop a cached upload. Already-gone entries are fine — the sweeper and a
 *  finished import both delete, and either may get there first. */
export function deleteMsMoneyUpload({ userId, uploadId }: { userId: number; uploadId: string }): Promise<void> {
  return msMoneyUploadCache.remove({ userId, id: uploadId });
}
