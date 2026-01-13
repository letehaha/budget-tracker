import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeBudgetStats } from '@root/serializers';
import { getBudgetStats } from '@root/services/budgets/stats';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
  }),
  async ({ user, params }) => {
    const stats = await getBudgetStats({ userId: user.id, budgetId: params.id });

    // Serialize: convert cents to decimal for API response
    return { data: serializeBudgetStats(stats) };
  },
);
