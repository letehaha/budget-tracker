import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as budgetService from '@services/budget.service';
import { z } from 'zod';

export const getBudgets = createController(z.object({}), async ({ user }) => {
  const data = await budgetService.getBudgets({ userId: user.id });
  return { data };
});

export const getBudgetById = createController(
  z.object({ params: z.object({ id: recordId() }) }),
  async ({ user, params }) => {
    const data = await budgetService.getBudgetById({ id: params.id, userId: user.id });
    return { data };
  },
);
