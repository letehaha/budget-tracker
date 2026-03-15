import { BUDGET_STATUSES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import { serializeBudget, serializeBudgets } from '@root/serializers';
import * as budgetService from '@services/budget.service';
import { z } from 'zod';

const budgetStatusValues = Object.values(BUDGET_STATUSES) as [BUDGET_STATUSES, ...BUDGET_STATUSES[]];

const commaSeparatedStatuses = z
  .string()
  .transform((val) => val.split(','))
  .pipe(z.array(z.enum(budgetStatusValues)).min(1));

export const getBudgets = createController(
  z.object({
    query: z
      .object({
        status: commaSeparatedStatuses.optional(),
      })
      .optional()
      .default({}),
  }),
  async ({ user, query }) => {
    const statuses = query.status ?? [BUDGET_STATUSES.active];

    const budgets = await budgetService.getBudgets({ userId: user.id, statuses });
    // Serialize: convert cents to decimal for API response
    return { data: serializeBudgets(budgets) };
  },
);

export const getBudgetById = createController(
  z.object({ params: z.object({ id: recordId() }) }),
  async ({ user, params }) => {
    const budget = await budgetService.getBudgetById({ id: params.id, userId: user.id });

    if (!budget) {
      throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });
    }

    // Serialize: convert cents to decimal for API response
    return { data: serializeBudget(budget) };
  },
);
