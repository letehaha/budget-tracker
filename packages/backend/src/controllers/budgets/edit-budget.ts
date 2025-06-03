import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as editBudgetService from '@services/budgets/edit-budget';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z
    .object({
      name: z.string().min(1, 'Name is required').max(200, 'Name must not exceed 200 characters').trim().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      autoInclude: z.boolean().optional().default(false),
      limitAmount: z.number().positive('Limit amount must be positive').optional(),
    })
    .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
      message: 'Start date cannot be later than end date',
      path: ['startDate', 'endDate'],
    }),
});

export default createController(schema, async ({ user, params, body }) => {
  const { name, startDate, endDate, limitAmount, autoInclude } = body;

  return editBudgetService.editBudget({
    id: params.id,
    userId: user.id,
    name,
    startDate,
    endDate,
    limitAmount,
    autoInclude,
  });
});
