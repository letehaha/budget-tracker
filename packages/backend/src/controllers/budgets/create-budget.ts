import { API_RESPONSE_STATUS, BUDGET_STATUSES } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import * as budgetsService from '@root/services/budgets/create-budget';
import { z } from 'zod';

export const createBudget = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { name, startDate, endDate, autoInclude, limitAmount, categoryId }: CreationBudgetParams = req.validated.body;

  const params = {
    name,
    userId,
    status: BUDGET_STATUSES.active,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    autoInclude,
    limitAmount,
    categoryId,
  };

  try {
    const data = await budgetsService.createBudget(params);

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const CreationBudgetPayloadSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(200, 'The name must not exceed 200 characters').trim(),
    startDate: z.string().datetime().nullable().optional(),
    endDate: z.string().datetime().nullable().optional(),
    autoInclude: z.boolean().optional().default(false),
    limitAmount: z.number().positive('Limit amount must be positive').nullable().optional(),
    categoryId: z.number().int().positive('Category ID must be a positive integer').nullable().optional(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: 'Start date cannot be later than end date',
    path: ['startDate', 'endDate'],
  });

export const createBudgetSchema = z.object({
  body: CreationBudgetPayloadSchema,
});

export type CreationBudgetParams = z.infer<typeof CreationBudgetPayloadSchema>;
