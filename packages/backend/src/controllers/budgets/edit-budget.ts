import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import * as editBudgetService from '@services/budgets/edit-budget';
import { z } from 'zod';

export const editBudget = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { id: budgetId }: z.infer<typeof paramsSchema> = req.validated.params;
  const { name, startDate, endDate, limitAmount, autoInclude }: z.infer<typeof bodySchema> = req.validated.body;

  try {
    const result = await editBudgetService.editBudget({
      id: Number(budgetId),
      userId,
      name,
      startDate,
      endDate,
      limitAmount,
      autoInclude,
    });
    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

const paramsSchema = z.object({
  id: recordId(),
});

const bodySchema = z
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
  });

const editBudgetParamsSchema = z.object({
  params: paramsSchema,
  body: bodySchema,
});

export const editBudgetSchema = editBudgetParamsSchema;
