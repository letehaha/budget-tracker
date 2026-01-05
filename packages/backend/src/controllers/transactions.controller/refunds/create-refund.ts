import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createSingleRefund } from '@services/tx-refunds/create-single-refund.service';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    originalTxId: recordId().nullable(),
    refundTxId: recordId(),
    // Optional: when provided, the refund targets a specific split of the original transaction
    splitId: z.string().uuid().optional(),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { originalTxId, refundTxId, splitId } = body;

  const data = await createSingleRefund({
    originalTxId,
    refundTxId,
    userId,
    splitId,
  });

  return { data };
});
