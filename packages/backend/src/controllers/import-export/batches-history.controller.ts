import type { ImportBatchesHistoryResponse } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { listBatchesHistory } from '@services/import-export/get-batches-history.service';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    limit: z
      .preprocess((val) => Number(val), z.number().int().min(1).max(100))
      .optional()
      .default(30),
    offset: z
      .preprocess((val) => Number(val), z.number().int().nonnegative())
      .optional()
      .default(0),
  }),
});

export const batchesHistoryController = createController(schema, async ({ user, query }) => {
  const data: ImportBatchesHistoryResponse = await listBatchesHistory({
    userId: user.id,
    limit: query.limit,
    offset: query.offset,
  });

  return { data };
});
