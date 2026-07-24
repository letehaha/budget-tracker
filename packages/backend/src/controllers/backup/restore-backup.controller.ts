import { createController } from '@controllers/helpers/controller-factory';
import { preflightRestore, queueBackupRestore } from '@services/backup';
import { z } from 'zod';

/**
 * POST /user/backup/restore
 *
 * Validates the uploaded backup synchronously (preflight → 422 on a structural
 * failure, 409 when the user owns shares and hasn't acknowledged), then enqueues
 * the destructive restore job and returns its id for progress polling.
 */
export const restoreBackupController = createController(
  z.object({
    body: z.object({
      /** Base64-encoded backup zip. */
      fileContent: z.string().min(1),
      acknowledgeSharing: z.boolean().optional(),
    }),
  }),
  async ({ user, body }) => {
    await preflightRestore({
      userId: user.id,
      fileContent: body.fileContent,
      acknowledgeSharing: body.acknowledgeSharing,
    });

    const jobId = await queueBackupRestore({ userId: user.id, fileContent: body.fileContent });
    return { data: { jobId } };
  },
);
