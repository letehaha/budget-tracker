import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getRefund as getRefundService } from '@services/tx-refunds/get-refund.service';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    originalTxId: recordId(),
    refundTxId: recordId(),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const { id: userId } = user;

  const data = await getRefundService({
    originalTxId: query.originalTxId,
    refundTxId: query.refundTxId,
    userId,
  });

  return { data };
});
