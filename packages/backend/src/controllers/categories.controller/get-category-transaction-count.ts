import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { countTransactions } from '@models/transactions-query';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { id: userId } = user;
  const { id: categoryId } = params;

  // This number drives the delete/reassign prompt, so it must match the guard in
  // deleteCategory row for row: every row that blocks the delete — planned ones and
  // balance adjustments included — is counted here.
  const transactionCount = await countTransactions({
    where: { categoryId },
    planned: 'include',
    access: { creator: userId },
    balanceAdjustments: 'include',
  });

  return { data: { transactionCount } };
});
