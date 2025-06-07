import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { getBudgetStats } from '@root/services/budgets/stats';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
  }),
  async ({ user, params }) => {
    const data = await getBudgetStats({ userId: user.id, budgetId: params.id });

    return { data };
  },
);
