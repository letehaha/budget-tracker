import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import * as deleteBudgetService from '@root/services/budgets/delete-budget';
import { z } from 'zod';

export interface DeleteBudgetPayload {
  id: number;
  userId?: number;
}

export const deleteBudget = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { id: budgetId }: DeleteBudgetPayload = req.params;

  if (!budgetId || isNaN(Number(budgetId)) || Number(budgetId) <= 0) {
    return res.status(400).json({
      status: API_RESPONSE_STATUS.error,
      response: { message: 'Invalid or missing budget ID', code: 'INVALID_ID' },
    });
  }

  const id = Number(budgetId);

  try {
    const result = await deleteBudgetService.deleteBudget({
      id,
      userId,
    });
    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

const paramsZodSchema = z.object({
  id: z.string().refine((val) => !isNaN(Number(val)), {
    message: 'ID must be a valid number',
  }),
});

export const deleteBudgetParamsSchema = z.object({
  params: paramsZodSchema,
});

export const deleteBudgetSchema = deleteBudgetParamsSchema;
