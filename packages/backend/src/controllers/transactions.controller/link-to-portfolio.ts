import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeTransferResponse } from '@controllers/investments/portfolios/serialize-transfer';
import { linkTransactionToPortfolio } from '@services/investments/portfolios/transfers';
import z from 'zod';

const schema = z.object({
  params: z.object({
    transactionId: recordId(),
  }),
  body: z.object({
    portfolioId: recordId(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const transfer = await linkTransactionToPortfolio({
    userId: user.id,
    transactionId: params.transactionId,
    portfolioId: body.portfolioId,
  });

  return { data: serializeTransferResponse({ transfer }) };
});
