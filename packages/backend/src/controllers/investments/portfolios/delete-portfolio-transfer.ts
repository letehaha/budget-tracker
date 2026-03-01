import { booleanQuery, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deletePortfolioTransfer } from '@services/investments/portfolios/transfers';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
    transferId: recordId(),
  }),
  query: z.object({
    deleteLinkedTransaction: booleanQuery().optional().default(false),
  }),
});

export default createController(schema, async ({ user, params, query }) => {
  await deletePortfolioTransfer({
    userId: user.id,
    transferId: params.transferId,
    deleteLinkedTransaction: query.deleteLinkedTransaction,
  });

  return { statusCode: 204 };
});
