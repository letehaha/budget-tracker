import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeBudget } from '@root/serializers';
import { toggleBudgetArchive } from '@root/services/budgets/toggle-archive';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
    body: z.object({ isArchived: z.boolean() }),
  }),
  async ({ user, params, body }) => {
    const budget = await toggleBudgetArchive({
      id: params.id,
      userId: user.id,
      isArchived: body.isArchived,
    });

    return { data: serializeBudget(budget) };
  },
);
