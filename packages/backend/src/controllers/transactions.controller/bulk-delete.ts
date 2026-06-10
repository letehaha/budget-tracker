import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as transactionsService from '@services/transactions/bulk-delete';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    transactionIds: z
      .array(recordId())
      .min(1, 'At least one transaction ID required')
      .max(500, 'Maximum 500 transactions per bulk delete'),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const result = await transactionsService.bulkDelete({
    userId: user.id,
    transactionIds: body.transactionIds,
  });

  return { data: result };
});
