import { dateString, positiveAmountString, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { accountToPortfolioTransfer } from '@services/investments/portfolios/transfers';
import { z } from 'zod';

import { serializeTransferResponse } from './serialize-transfer';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z.object({
    accountId: recordId(),
    amount: positiveAmountString(),
    date: dateString(),
    description: z.string().nullable().optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const transfer = await accountToPortfolioTransfer({
    userId: user.id,
    accountId: body.accountId,
    portfolioId: params.id,
    amount: body.amount,
    date: body.date,
    description: body.description || null,
  });

  return { data: serializeTransferResponse({ transfer }) };
});
