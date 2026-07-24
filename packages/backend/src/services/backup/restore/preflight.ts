import { API_ERROR_CODES } from '@bt/shared/types';
import { ConflictError } from '@js/errors';
import { getOwnedSharedResourceSummary } from '@services/user/wipe-user-data.service';

import { loadValidatedArchive } from './load-validated-archive';

/**
 * Synchronous gate run before enqueuing a restore. Fully validates the upload —
 * base64/zip readability, manifest format version, per-file SHA-256, JSON
 * parseability, and the column tolerance against the live schema — rejecting
 * with a 422 (`ValidationError`) and a human-readable reason on any hard
 * failure. Then, like the wipe flow, it requires `acknowledgeSharing` when the
 * user owns shared resources, throwing the same 409 contract
 * (`wipeDataSharingAcknowledgementRequired`) so the frontend reuses the wipe UX.
 */
export async function preflightRestore({
  userId,
  fileContent,
  acknowledgeSharing,
}: {
  userId: number;
  fileContent: string;
  acknowledgeSharing?: boolean;
}): Promise<void> {
  await loadValidatedArchive({ fileContent });

  if (!acknowledgeSharing) {
    const summary = await getOwnedSharedResourceSummary({ userId });
    if (summary.accounts.length > 0 || summary.households.length > 0) {
      throw new ConflictError({
        code: API_ERROR_CODES.wipeDataSharingAcknowledgementRequired,
        message:
          'Restoring a backup replaces all your current data and will revoke access for other users currently sharing your resources.',
        details: { sharedResources: summary },
      });
    }
  }
}
