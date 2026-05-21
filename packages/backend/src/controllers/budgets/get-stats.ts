import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeBudgetStats } from '@root/serializers';
import { authorizeBudgetRead } from '@root/services/budgets/authorize-budget-access';
import { getBudgetStats } from '@root/services/budgets/stats';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      id: recordId(),
    }),
  }),
  async ({ user, params }) => {
    // Share-aware auth: recipient sees the same numbers the owner would (per PRD
    // visibility decision). Stats compute against the owner's userId, not the caller's,
    // so a recipient's slice of unrelated transactions doesn't filter the result.
    const { ownerUserId } = await authorizeBudgetRead({ userId: user.id, budgetId: params.id });
    const stats = await getBudgetStats({ userId: ownerUserId, budgetId: params.id });

    return { data: serializeBudgetStats(stats) };
  },
);
