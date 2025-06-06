import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { removeRefundLink } from '@services/tx-refunds/remove-refund-link.service';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    originalTxId: recordId().nullable(),
    refundTxId: recordId(),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const { originalTxId, refundTxId } = body;
  const { id: userId } = user;

  await removeRefundLink({
    originalTxId,
    refundTxId,
    userId,
  });
});
