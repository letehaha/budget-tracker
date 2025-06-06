import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as deleteBudgetService from '@root/services/budgets/delete-budget';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const data = await deleteBudgetService.deleteBudget({
    id: params.id,
    userId: user.id,
  });

  return { data };
});
