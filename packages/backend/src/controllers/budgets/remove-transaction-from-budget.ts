import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { removeTransactionsFromBudget } from '@services/budgets/remove-transactions-from-budget';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z.object({
    transactionIds: z.array(recordId()),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  await removeTransactionsFromBudget({
    budgetId: Number(params.id),
    userId: user.id,
    transactionIds: body.transactionIds,
  });
});
