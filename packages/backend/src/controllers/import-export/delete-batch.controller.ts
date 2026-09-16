import type { DeleteImportBatchResult } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { queueImportBatchDelete } from '@services/import-export/delete-batch-queue';
import { ImportBatchTooLargeError, deleteImportBatch } from '@services/import-export/delete-batch.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    batchId: recordId(),
  }),
  body: z
    .object({
      deleteLinkedTransfers: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Small batches delete inline and return the deleted ids. A batch above the sync
 * cap is handed to the background worker instead and answered 202 with its job id;
 * the client tracks it via GET /import/batch-delete/status.
 */
export const deleteBatchController = createController(schema, async ({ user, params, body }) => {
  const request = {
    userId: user.id,
    batchId: params.batchId,
    deleteLinkedTransfers: body?.deleteLinkedTransfers ?? false,
  };

  try {
    const data: DeleteImportBatchResult = await deleteImportBatch(request);
    return { data };
  } catch (error) {
    if (!(error instanceof ImportBatchTooLargeError)) throw error;
    const data: DeleteImportBatchResult = { jobId: await queueImportBatchDelete(request) };
    return { data, statusCode: 202 };
  }
});
