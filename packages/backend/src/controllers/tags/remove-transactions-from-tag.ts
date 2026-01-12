import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { removeTransactionsFromTag } from '@services/tags/transaction-tags';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z.object({
    transactionIds: z.array(recordId()).min(1, { message: 'At least one transaction ID is required' }),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const data = await removeTransactionsFromTag({
    tagId: params.id,
    userId: user.id,
    transactionIds: body.transactionIds,
  });

  return { data };
});
