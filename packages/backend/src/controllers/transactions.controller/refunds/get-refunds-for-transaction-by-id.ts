import { createController } from '@controllers/helpers/controller-factory';
import { serializeRefundTransactions } from '@root/serializers';
import * as service from '@services/tx-refunds/get-refund-for-transaction-by-id.service';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    transactionId: z
      .string()
      .refine(
        (val) => {
          const id = parseInt(val);
          return !isNaN(id) && id > 0;
        },
        { message: 'Invalid transaction ID' },
      )
      .transform((val) => parseInt(val)),
  }),
});

export default createController(schema, async ({ user, query }) => {
  const { id: userId } = user;
  const { transactionId } = query;

  const refunds = await service.getRefundsForTransactionById({
    transactionId,
    userId,
  });

  // Serialize: convert cents to decimal for API response
  return { data: serializeRefundTransactions(refunds) };
});
