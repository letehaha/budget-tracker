import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { addTransactionsToBudget as addTransactionsToBudgetService } from '@services/budgets/add-transactions-to-budget';
import { z } from 'zod';

export const addTransactionsToBudget = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { id: budgetId }: z.infer<typeof paramsSchema> = req.validated.params;
  const { transactionIds }: z.infer<typeof bodySchema> = req.validated.body;

  try {
    const result = await addTransactionsToBudgetService({
      budgetId: Number(budgetId),
      userId,
      transactionIds,
    });
    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: result,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const paramsSchema = z.object({
  id: recordId(),
});

export const bodySchema = z.object({
  transactionIds: z
    .array(recordId())
    .min(1, { message: 'At least one transaction ID is required' })
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Transaction IDs must be unique',
    }),
});

const addTransactionToBudgetScheme = z.object({
  params: paramsSchema,
  body: bodySchema,
});

export const addTransactionsToBudgetSchema = addTransactionToBudgetScheme;
