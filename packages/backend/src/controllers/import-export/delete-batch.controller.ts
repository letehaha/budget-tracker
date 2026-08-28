import type { DeleteImportBatchResponse } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteImportBatch } from '@services/import-export/delete-batch.service';
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

export const deleteBatchController = createController(schema, async ({ user, params, body }) => {
  const data: DeleteImportBatchResponse = await deleteImportBatch({
    userId: user.id,
    batchId: params.batchId,
    deleteLinkedTransfers: body?.deleteLinkedTransfers,
  });

  return { data };
});
