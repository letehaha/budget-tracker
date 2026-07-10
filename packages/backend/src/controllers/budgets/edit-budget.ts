import { dateBound, recordId, recordArrayIds, withDateOrder } from '@common/lib/zod/custom-types';
import { Money } from '@common/types/money';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeBudget } from '@root/serializers';
import * as editBudgetService from '@services/budgets/edit-budget';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: withDateOrder(
    z.object({
      name: z.string().min(1, 'Name is required').max(200, 'Name must not exceed 200 characters').trim().optional(),
      categoryIds: recordArrayIds().optional(),
      startDate: dateBound({ precision: 'datetime' }).optional(),
      endDate: dateBound({ precision: 'datetime' }).optional(),
      autoInclude: z.boolean().optional().default(false),
      // Amount field accepts decimals - conversion to cents happens below
      limitAmount: z.number().positive('Limit amount must be positive').optional(),
    }),
    ['startDate', 'endDate'],
  ),
});

export default createController(schema, async ({ user, params, body }) => {
  const { name, categoryIds, startDate, endDate, limitAmount, autoInclude } = body;

  const budget = await editBudgetService.editBudget({
    id: params.id,
    userId: user.id,
    name,
    categoryIds,
    startDate,
    endDate,
    limitAmount: limitAmount !== undefined ? Money.fromDecimal(limitAmount) : undefined,
    autoInclude,
  });

  // Serialize: convert cents to decimal for API response
  return { data: budget ? serializeBudget(budget) : null };
});
