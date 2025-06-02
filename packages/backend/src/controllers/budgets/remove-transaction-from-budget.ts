import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { removeTransactionsFromBudget } from '@services/budgets/remove-transactions-from-budget';
import { z } from 'zod';

const handler = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { id: budgetId }: z.infer<typeof paramsSchema> = req.validated.params;
  const { transactionIds }: z.infer<typeof bodySchema> = req.validated.body;

  try {
    await removeTransactionsFromBudget({
      budgetId: Number(budgetId),
      userId,
      transactionIds,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

const paramsSchema = z.object({
  id: recordId(),
});

const bodySchema = z.object({
  transactionIds: z.array(recordId()),
});

const schema = z.object({
  params: paramsSchema,
  body: bodySchema,
});

export default { schema, handler };
