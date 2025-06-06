import { createController } from '@controllers/helpers/controller-factory';
import * as transactionsService from '@services/transactions';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    transferIds: z.array(z.string()).nonempty('"transferIds" field is required and should be an array if transferIds.'),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { transferIds } = body;

  const data = await transactionsService.unlinkTransferTransactions({
    userId,
    transferIds: [...new Set(transferIds)],
  });

  return { data };
});
