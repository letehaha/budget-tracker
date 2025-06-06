import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as transactionsService from '@services/transactions';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { id } = params;
  const { id: userId } = user;

  await transactionsService.deleteTransaction({ id, userId });
});
