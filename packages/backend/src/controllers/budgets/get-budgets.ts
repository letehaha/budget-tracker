import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as budgetService from '@services/budget.service';
import { z } from 'zod';

export const getBudgets = createController(z.object({}), ({ user }) => {
  return budgetService.getBudgets({ userId: user.id });
});

export const getBudgetById = createController(
  z.object({ params: z.object({ id: recordId() }) }),
  async ({ user, params }) => {
    return budgetService.getBudgetById({ id: params.id, userId: user.id });
  },
);
