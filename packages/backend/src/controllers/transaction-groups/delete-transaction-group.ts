import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as transactionGroupsService from '@services/transaction-groups';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const data = await transactionGroupsService.deleteTransactionGroup({
    id: params.id,
    userId: user.id,
  });

  return { data };
});
