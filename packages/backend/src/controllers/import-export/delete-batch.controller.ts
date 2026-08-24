import type { DeleteImportBatchResponse } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteImportBatch } from '@services/import-export/delete-batch.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    batchId: recordId(),
  }),
});

export const deleteBatchController = createController(schema, async ({ user, params }) => {
  const data: DeleteImportBatchResponse = await deleteImportBatch({
    userId: user.id,
    batchId: params.batchId,
  });

  return { data };
});
