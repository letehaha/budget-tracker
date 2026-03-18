import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { unlinkTransactionFromPortfolio } from '@services/investments/portfolios/transfers';
import z from 'zod';

const schema = z.object({
  params: z.object({
    transactionId: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  await unlinkTransactionFromPortfolio({
    userId: user.id,
    transactionId: params.transactionId,
  });

  return { statusCode: 204 };
});
