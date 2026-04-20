import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import * as Transactions from '@models/transactions.model';
import { createDismissal } from '@models/transfer-suggestion-dismissals.model';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    expenseTransactionId: recordId(),
    incomeTransactionId: recordId(),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { expenseTransactionId, incomeTransactionId } = body;

  // Verify both transactions belong to the authenticated user
  const transactions = await Transactions.getTransactionsByArrayOfField({
    userId,
    fieldName: 'id',
    fieldValues: [expenseTransactionId, incomeTransactionId],
  });

  if (transactions.length !== 2) {
    throw new ValidationError({
      message: 'One or both transactions not found',
    });
  }

  await createDismissal({ userId, expenseTransactionId, incomeTransactionId });

  return { statusCode: 204 };
});
