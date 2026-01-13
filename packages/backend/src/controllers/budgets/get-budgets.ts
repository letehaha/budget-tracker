import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeBudget, serializeBudgets } from '@root/serializers';
import * as budgetService from '@services/budget.service';
import { z } from 'zod';

export const getBudgets = createController(z.object({}), async ({ user }) => {
  const budgets = await budgetService.getBudgets({ userId: user.id });
  // Serialize: convert cents to decimal for API response
  return { data: serializeBudgets(budgets) };
});

export const getBudgetById = createController(
  z.object({ params: z.object({ id: recordId() }) }),
  async ({ user, params }) => {
    const budget = await budgetService.getBudgetById({ id: params.id, userId: user.id });
    // Serialize: convert cents to decimal for API response
    return { data: budget ? serializeBudget(budget) : null };
  },
);
