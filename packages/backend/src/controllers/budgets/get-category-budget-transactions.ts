import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { authorizeBudgetRead } from '@root/services/budgets/authorize-budget-access';
import * as getCategoryBudgetTransactionsService from '@services/budgets/get-category-budget-transactions';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  query: z.object({
    from: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

export default createController(schema, async ({ user, params, query }) => {
  // Share-aware auth: recipient sees owner's transactions on the budget (per PRD
  // visibility decision), not a recipient-userId slice.
  const { ownerUserId } = await authorizeBudgetRead({ userId: user.id, budgetId: params.id });
  const result = await getCategoryBudgetTransactionsService.getCategoryBudgetTransactions({
    userId: ownerUserId,
    budgetId: params.id,
    from: query.from,
    limit: query.limit,
  });

  return { data: result };
});
