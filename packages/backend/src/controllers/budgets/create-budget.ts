import { BUDGET_STATUSES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import * as budgetsService from '@root/services/budgets/create-budget';
import { z } from 'zod';

const schema = z.object({
  body: z
    .object({
      name: z.string().min(1, 'Name is required').max(200, 'The name must not exceed 200 characters').trim(),
      startDate: z.string().datetime().nullable().optional(),
      endDate: z.string().datetime().nullable().optional(),
      autoInclude: z.boolean().optional().default(false),
      limitAmount: z.number().positive('Limit amount must be positive').nullable().optional(),
    })
    .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
      message: 'Start date cannot be later than end date',
      path: ['startDate', 'endDate'],
    }),
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { name, startDate, endDate, autoInclude, limitAmount } = body;

  const data = await budgetsService.createBudget({
    name,
    userId,
    status: BUDGET_STATUSES.active,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    autoInclude,
    limitAmount,
  });

  return { data };
});
