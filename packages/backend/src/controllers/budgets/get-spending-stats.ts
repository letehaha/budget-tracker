import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeBudgetSpendingStats } from '@root/serializers';
import { authorizeBudgetRead } from '@root/services/budgets/authorize-budget-access';
import { getBudgetSpendingStats } from '@root/services/budgets/spending-stats';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
  }),
  async ({ user, params }) => {
    const { ownerUserId } = await authorizeBudgetRead({ userId: user.id, budgetId: params.id });
    const stats = await getBudgetSpendingStats({ userId: ownerUserId, budgetId: params.id });

    return { data: serializeBudgetSpendingStats(stats) };
  },
);
